use reqwest::blocking::Client;
use std::{
    env,
    error::Error,
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread::sleep,
    time::{Duration, Instant},
};
use tauri::{webview::WebviewWindowBuilder, AppHandle, Manager, RunEvent, State, WebviewUrl};
use tauri_plugin_shell::process::CommandChild;

#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

struct ServerProcess(Mutex<Option<CommandChild>>);
struct RunnerProcess(Mutex<Option<RunnerInstance>>);

struct RunnerInstance {
    base_url: String,
    child: Child,
}

#[derive(Clone)]
struct RunnerConnection {
    base_url: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(ServerProcess(Mutex::new(None)))
        .manage(RunnerProcess(Mutex::new(None)))
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![ensure_runner])
        .setup(|app| {
            let app_url = resolve_app_url(app.handle())?;

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(app_url.parse()?))
                .title("Clanki")
                .inner_size(1440.0, 920.0)
                .min_inner_size(960.0, 720.0)
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            let server_process = app_handle.state::<ServerProcess>();
            let server_child = {
                let mut process = server_process.0.lock().expect("server process lock");
                process.take()
            };

            if let Some(child) = server_child {
                let _ = child.kill();
            }

            stop_runner(app_handle.state::<RunnerProcess>().inner());
        }
    });
}

#[tauri::command]
fn ensure_runner(
    app: AppHandle,
    runner_process: State<'_, RunnerProcess>,
) -> Result<String, String> {
    let runner = start_runner_if_needed(&app, runner_process.inner())?;
    Ok(runner.base_url)
}

fn start_runner_if_needed(
    app: &AppHandle,
    runner_process: &RunnerProcess,
) -> Result<RunnerConnection, String> {
    if let Some(connection) = current_runner_connection(runner_process) {
        if is_runner_healthy(&connection.base_url) {
            return Ok(connection);
        }

        stop_runner(runner_process);
    }

    start_runner(app, runner_process)
}

fn current_runner_connection(runner_process: &RunnerProcess) -> Option<RunnerConnection> {
    let process = runner_process.0.lock().expect("runner process lock");
    process.as_ref().map(|runner| RunnerConnection {
        base_url: runner.base_url.clone(),
    })
}

fn start_runner(
    app: &AppHandle,
    runner_process: &RunnerProcess,
) -> Result<RunnerConnection, String> {
    let workspace_root = resolve_workspace_root(app)?;
    let runner_entry = workspace_root.join("packages/runner/src/cli.ts");

    if !runner_entry.exists() {
        return Err(format!(
            "Runner entry not found at {}",
            runner_entry.display()
        ));
    }

    let port = reserve_local_port().map_err(|error| error.to_string())?;
    let mut command = Command::new(resolve_bun_binary());
    command
        .arg(runner_entry.display().to_string())
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .current_dir(&workspace_root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit());

    let child = command
        .spawn()
        .map_err(|error| format!("Failed to start local runner: {error}"))?;
    wait_for_server(port).map_err(|error| error.to_string())?;

    let base_url = format!("http://127.0.0.1:{port}");
    let connection = RunnerConnection {
        base_url: base_url.clone(),
    };

    let mut process = runner_process.0.lock().expect("runner process lock");
    *process = Some(RunnerInstance { base_url, child });

    Ok(connection)
}

fn stop_runner(runner_process: &RunnerProcess) {
    let runner = {
        let mut process = runner_process.0.lock().expect("runner process lock");
        process.take()
    };

    if let Some(mut runner) = runner {
        let _ = runner.child.kill();
        let _ = runner.child.wait();
    }
}

fn is_runner_healthy(base_url: &str) -> bool {
    let client = match runner_http_client() {
        Ok(client) => client,
        Err(_) => return false,
    };

    client
        .get(format!("{base_url}/health"))
        .send()
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

fn runner_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Failed to create runner HTTP client: {error}"))
}

#[cfg(debug_assertions)]
fn resolve_workspace_root(_app: &AppHandle) -> Result<PathBuf, String> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .map_err(|error| format!("Failed to resolve workspace root: {error}"))
}

#[cfg(not(debug_assertions))]
fn resolve_workspace_root(_app: &AppHandle) -> Result<PathBuf, String> {
    std::env::current_dir().map_err(|error| format!("Failed to resolve workspace root: {error}"))
}

fn resolve_bun_binary() -> &'static str {
    "bun"
}

#[cfg(debug_assertions)]
fn resolve_app_url(_app: &AppHandle) -> Result<String, Box<dyn Error>> {
    Ok("http://127.0.0.1:1420".to_string())
}

#[cfg(not(debug_assertions))]
fn resolve_app_url(app: &AppHandle) -> Result<String, Box<dyn Error>> {
    let port = reserve_local_port()?;
    let resource_dir = app.path().resource_dir()?;
    let server_entry = resource_dir.join(".output/server/index.mjs");

    let sidecar_command = app.shell().sidecar("bun")?;
    let (rx, child) = sidecar_command
        .current_dir(resource_dir.display().to_string())
        .env("HOST", "127.0.0.1")
        .env("PORT", port.to_string())
        .arg(server_entry.display().to_string())
        .spawn()?;

    {
        let server_process = app.state::<ServerProcess>();
        *server_process.0.lock().expect("server process lock") = Some(child);
    }

    tauri::async_runtime::spawn(async move {
        let mut events = rx;

        while let Some(event) = events.recv().await {
            if let tauri_plugin_shell::process::CommandEvent::Stderr(line) = event {
                eprintln!("{}", String::from_utf8_lossy(&line));
            }
        }
    });

    wait_for_server(port)?;

    Ok(format!("http://127.0.0.1:{port}"))
}

fn reserve_local_port() -> Result<u16, Box<dyn Error>> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn wait_for_server(port: u16) -> Result<(), Box<dyn Error>> {
    let timeout = Duration::from_secs(15);
    let started_at = Instant::now();

    while started_at.elapsed() < timeout {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return Ok(());
        }

        sleep(Duration::from_millis(100));
    }

    Err(std::io::Error::new(
        std::io::ErrorKind::TimedOut,
        format!("Timed out waiting for the local Clanki server on port {port}"),
    )
    .into())
}
