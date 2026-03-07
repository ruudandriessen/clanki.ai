use reqwest::blocking::Client;
use serde::Serialize;
use std::{
    collections::HashSet,
    env,
    error::Error,
    fs,
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread::sleep,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
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

struct RepoWorkspacePaths {
    default_directory: PathBuf,
    repo_root: PathBuf,
}

struct PreparedWorktree {
    branch_name: String,
    directory: PathBuf,
    default_directory: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunnerConnectionPayload {
    base_url: String,
    workspace_directory: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(ServerProcess(Mutex::new(None)))
        .manage(RunnerProcess(Mutex::new(None)))
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![ensure_runner_connection])
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
fn ensure_runner_connection(
    app: AppHandle,
    runner_process: State<'_, RunnerProcess>,
    repo_url: String,
) -> Result<RunnerSessionsPayload, String> {
    let runner = ensure_runner(&app, runner_process.inner())?;
    let workspace = resolve_repo_workspace_paths(&repo_url)?;
    let client = runner_http_client()?;
    let sessions = list_repo_sessions(&client, &runner, &workspace.repo_root)?;

    Ok(RunnerSessionsPayload {
        sessions,
        workspace_directory: workspace.repo_root.display().to_string(),
    })
}

#[tauri::command]
fn create_runner_session(
    app: AppHandle,
    runner_process: State<'_, RunnerProcess>,
    repo_url: String,
    title: String,
) -> Result<CreateRunnerSessionResponse, String> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("title is required".to_string());
    }

    let runner = ensure_runner(&app, runner_process.inner())?;
    let worktree = prepare_session_worktree(&repo_url, trimmed_title)?;
    let client = runner_http_client()?;
    let response = client
        .post(format!("{}/assistant/session/ensure", runner.base_url))
        .json(&EnsureAssistantSessionRequest {
            directory: worktree.directory.display().to_string(),
            model: DEFAULT_OPENCODE_MODEL.to_string(),
            provider: DEFAULT_OPENCODE_PROVIDER.to_string(),
            task_title: trimmed_title.to_string(),
        })
        .send()
        .map_err(|error| format!("Failed to reach local runner: {error}"))?;
    let payload: EnsureAssistantSessionResponse = match parse_runner_json(response) {
        Ok(payload) => payload,
        Err(error) => {
            cleanup_failed_worktree(&worktree);
            return Err(error);
        }
    };

    Ok(CreateRunnerSessionResponse {
        session_id: payload.session_id,
    })
}
fn ensure_runner(
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

fn list_repo_sessions(
    client: &Client,
    runner: &RunnerConnection,
    repo_root: &Path,
) -> Result<Vec<RunnerSessionSummary>, String> {
    let workspace_directories = list_workspace_directories(repo_root)?;
    let mut sessions = Vec::new();
    let mut seen_session_ids = HashSet::new();

    for directory in workspace_directories {
        let directory_string = directory.display().to_string();
        let response = client
            .get(format!("{}/assistant/sessions", runner.base_url))
            .query(&[("directory", directory_string.as_str())])
            .send()
            .map_err(|error| format!("Failed to reach local runner: {error}"))?;
        let payload: ListAssistantSessionsResponse = parse_runner_json(response)?;

        for session in payload.sessions {
            if seen_session_ids.insert(session.id.clone()) {
                sessions.push(session);
            }
        }
    }

    sessions.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then(right.created_at.cmp(&left.created_at))
    });

    Ok(sessions)
}

fn list_workspace_directories(repo_root: &Path) -> Result<Vec<PathBuf>, String> {
    if !repo_root.exists() {
        return Ok(Vec::new());
    }

    let mut directories = Vec::new();

    for entry in fs::read_dir(repo_root).map_err(|error| {
        format!(
            "Failed to read workspace directory {}: {error}",
            repo_root.display()
        )
    })? {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to read a workspace entry in {}: {error}",
                repo_root.display()
            )
        })?;
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        if path.join(".git").exists() {
            directories.push(path);
        }
    }

    directories.sort();
    Ok(directories)
}

fn prepare_session_worktree(repo_url: &str, title: &str) -> Result<PreparedWorktree, String> {
    let workspace = resolve_repo_workspace_paths(repo_url)?;
    let default_branch = ensure_default_checkout(repo_url, &workspace)?;
    let identifier = next_worktree_identifier(&workspace.repo_root, title)?;
    let directory = workspace.repo_root.join(&identifier);
    let branch_name = format!("runner/{identifier}");

    run_command(
        "git",
        &[
            "-C",
            &workspace.default_directory.display().to_string(),
            "worktree",
            "add",
            "-b",
            &branch_name,
            &directory.display().to_string(),
            &default_branch,
        ],
        Some(format!(
            "Failed to create a worktree at {}",
            directory.display()
        )),
    )?;

    Ok(PreparedWorktree {
        branch_name,
        directory,
        default_directory: workspace.default_directory,
    })
}

fn cleanup_failed_worktree(worktree: &PreparedWorktree) {
    let _ = run_command(
        "git",
        &[
            "-C",
            &worktree.default_directory.display().to_string(),
            "worktree",
            "remove",
            "--force",
            &worktree.directory.display().to_string(),
        ],
        None,
    );
    let _ = run_command(
        "git",
        &[
            "-C",
            &worktree.default_directory.display().to_string(),
            "branch",
            "-D",
            &worktree.branch_name,
        ],
        None,
    );
}

fn ensure_default_checkout(
    repo_url: &str,
    workspace: &RepoWorkspacePaths,
) -> Result<String, String> {
    fs::create_dir_all(&workspace.repo_root).map_err(|error| {
        format!(
            "Failed to create workspace root {}: {error}",
            workspace.repo_root.display()
        )
    })?;

    if !workspace.default_directory.exists() {
        clone_default_checkout(repo_url, &workspace.default_directory)?;
    } else if !workspace.default_directory.join(".git").exists() {
        return Err(format!(
            "Managed checkout exists without git metadata: {}",
            workspace.default_directory.display()
        ));
    }

    run_command(
        "git",
        &[
            "-C",
            &workspace.default_directory.display().to_string(),
            "fetch",
            "origin",
            "--prune",
        ],
        Some(format!(
            "Failed to fetch the default checkout in {}",
            workspace.default_directory.display()
        )),
    )?;

    let default_branch = resolve_default_branch(&workspace.default_directory)?;

    run_command(
        "git",
        &[
            "-C",
            &workspace.default_directory.display().to_string(),
            "checkout",
            &default_branch,
        ],
        Some(format!(
            "Failed to checkout {default_branch} in {}",
            workspace.default_directory.display()
        )),
    )?;

    run_command(
        "git",
        &[
            "-C",
            &workspace.default_directory.display().to_string(),
            "pull",
            "--ff-only",
            "origin",
            &default_branch,
        ],
        Some(format!(
            "Failed to fast-forward {default_branch} in {}",
            workspace.default_directory.display()
        )),
    )?;

    Ok(default_branch)
}

fn clone_default_checkout(repo_url: &str, default_directory: &Path) -> Result<(), String> {
    if let Some(parent_directory) = default_directory.parent() {
        fs::create_dir_all(parent_directory).map_err(|error| {
            format!(
                "Failed to create clone parent directory {}: {error}",
                parent_directory.display()
            )
        })?;
    }

    let repo_slug = parse_repo_slug(repo_url)?;
    run_command(
        "gh",
        &[
            "repo",
            "clone",
            &repo_slug,
            &default_directory.display().to_string(),
        ],
        Some(format!(
            "Failed to clone {repo_slug} into {}",
            default_directory.display()
        )),
    )?;

    Ok(())
}

fn resolve_default_branch(default_directory: &Path) -> Result<String, String> {
    let output = run_command(
        "git",
        &[
            "-C",
            &default_directory.display().to_string(),
            "symbolic-ref",
            "--short",
            "refs/remotes/origin/HEAD",
        ],
        Some(format!(
            "Failed to resolve the default branch for {}",
            default_directory.display()
        )),
    )?;
    let reference = output.trim();
    let branch_name = reference
        .strip_prefix("origin/")
        .unwrap_or(reference)
        .trim()
        .to_string();

    if branch_name.is_empty() {
        return Err(format!(
            "Failed to resolve the default branch for {}",
            default_directory.display()
        ));
    }

    Ok(branch_name)
}

fn next_worktree_identifier(repo_root: &Path, title: &str) -> Result<String, String> {
    let title_slug = slugify_identifier(title);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Failed to build a worktree identifier: {error}"))?
        .as_secs();

    for attempt in 0..100 {
        let identifier = if attempt == 0 {
            format!("{timestamp}-{title_slug}")
        } else {
            format!("{timestamp}-{title_slug}-{attempt}")
        };

        if !repo_root.join(&identifier).exists() {
            return Ok(identifier);
        }
    }

    Err(format!(
        "Failed to allocate a unique worktree directory in {}",
        repo_root.display()
    ))
}

fn slugify_identifier(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_separator = false;

    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            last_was_separator = false;
            continue;
        }

        if !last_was_separator {
            slug.push('-');
            last_was_separator = true;
        }
    }

    let trimmed = slug.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "session".to_string()
    } else {
        trimmed
    }
}

fn resolve_repo_workspace_paths(repo_url: &str) -> Result<RepoWorkspacePaths, String> {
    let repo_name = parse_repo_name(repo_url)?;
    let repo_root = resolve_runner_root()?.join(repo_name);

    Ok(RepoWorkspacePaths {
        default_directory: repo_root.join("default"),
        repo_root,
    })
}

fn resolve_runner_root() -> Result<PathBuf, String> {
    let home_directory = env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Failed to resolve the user's home directory".to_string())?;

    Ok(home_directory.join("clanki"))
}

fn parse_repo_slug(repo_url: &str) -> Result<String, String> {
    let normalized = normalize_repo_reference(repo_url);
    let repo_path = if let Some(path) = normalized.strip_prefix("https://github.com/") {
        path
    } else if let Some(path) = normalized.strip_prefix("git@github.com:") {
        path
    } else if let Some(path) = normalized.strip_prefix("ssh://git@github.com/") {
        path
    } else {
        normalized.as_str()
    };

    let segments: Vec<&str> = repo_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    if segments.len() != 2 {
        return Err(format!("Unsupported GitHub repository URL: {repo_url}"));
    }

    Ok(format!("{}/{}", segments[0], segments[1]))
}

fn parse_repo_name(repo_url: &str) -> Result<String, String> {
    let repo_slug = parse_repo_slug(repo_url)?;
    repo_slug
        .split('/')
        .nth(1)
        .map(ToString::to_string)
        .ok_or_else(|| format!("Unsupported GitHub repository URL: {repo_url}"))
}

fn normalize_repo_reference(repo_url: &str) -> String {
    repo_url
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .to_string()
}

fn run_command(
    program: &str,
    args: &[&str],
    error_context: Option<String>,
) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| match &error_context {
            Some(context) => format!("{context}: {error}"),
            None => format!("Failed to run {program}: {error}"),
        })?;

    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let details = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("exit status {}", output.status)
    };

    match error_context {
        Some(context) => Err(format!("{context}: {details}")),
        None => Err(format!("Command {program} failed: {details}")),
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
        .join("..")
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
