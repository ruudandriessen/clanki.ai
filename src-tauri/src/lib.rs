use std::{
    error::Error,
    net::{TcpListener, TcpStream},
    sync::Mutex,
    thread::sleep,
    time::{Duration, Instant},
};
use tauri::{webview::WebviewWindowBuilder, AppHandle, Manager, RunEvent, WebviewUrl};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct ServerProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(ServerProcess(Mutex::new(None)))
        .plugin(tauri_plugin_shell::init())
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
            let child = {
                let mut process = server_process.0.lock().expect("server process lock");
                process.take()
            };

            if let Some(child) = child {
                let _ = child.kill();
            }
        }
    });
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

#[cfg(not(debug_assertions))]
fn reserve_local_port() -> Result<u16, Box<dyn Error>> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

#[cfg(not(debug_assertions))]
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
