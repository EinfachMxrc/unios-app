// SPDX-License-Identifier: AGPL-3.0-or-later

#[cfg(unix)]
fn signal(pid: u32, name: &str) -> bool {
    std::process::Command::new("/bin/kill")
        .args([name, &pid.to_string()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

/// Signal only the owned sidecar supervisor, allowing it to stop its worker
/// and clean its extracted runtime before the shell plugin tears down children.
#[cfg(unix)]
pub fn terminate_owned_child(pid: u32) -> bool {
    if pid <= 1 {
        return false;
    }
    if !signal(pid, "-TERM") {
        return !signal(pid, "-0");
    }
    for _ in 0..100 {
        if !signal(pid, "-0") {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    false
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};

    #[test]
    fn graceful_stop_allows_a_supervisor_to_reap_its_worker() {
        let script = r#"
import signal, subprocess, sys
worker = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
def stop(_signum, _frame):
    worker.terminate()
    worker.wait(timeout=2)
    sys.exit(0)
signal.signal(signal.SIGTERM, stop)
print(worker.pid, flush=True)
signal.pause()
"#;
        let mut parent = Command::new("python3")
            .args(["-u", "-c", script])
            .stdout(Stdio::piped())
            .spawn().unwrap();
        let mut reader = BufReader::new(parent.stdout.take().unwrap());
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        let worker: u32 = line.trim().parse().unwrap();
        let pid = parent.id();
        // Match the sidecar plugin: a separate thread reaps the supervisor.
        let reaper = std::thread::spawn(move || parent.wait().unwrap());
        let stopped = terminate_owned_child(pid);
        if !stopped {
            let _ = signal(worker, "-KILL");
            let _ = signal(pid, "-KILL");
        }
        assert!(stopped);
        assert!(reaper.join().unwrap().success());
        assert!(!signal(worker, "-0"), "worker must not survive the supervisor");
    }

    #[test]
    fn never_signals_a_process_group_or_init() {
        assert!(!terminate_owned_child(0));
        assert!(!terminate_owned_child(1));
    }
}
