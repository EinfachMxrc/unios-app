// SPDX-License-Identifier: AGPL-3.0-or-later

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

/// Match the native companion's exact loopback Host allowlist, including port.
pub fn backend_ready(address: SocketAddr) -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(400)) else {
        return false;
    };
    if stream
        .set_read_timeout(Some(Duration::from_millis(500)))
        .is_err()
        || stream
            .set_write_timeout(Some(Duration::from_millis(500)))
            .is_err()
    {
        return false;
    }
    let request = format!("GET /health HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut bytes = Vec::new();
    if stream.take(8192).read_to_end(&mut bytes).is_err() {
        return false;
    }
    let response = String::from_utf8_lossy(&bytes);
    response.starts_with("HTTP/1.1 200") && response.contains("\"status\":\"ok\"")
}

/// Keep watching our own service while it is alive, even when macOS delays startup.
/// A slow start is information, not a port conflict or a reason to stop watching.
pub fn wait_for_backend(
    mut running: impl FnMut() -> bool,
    mut ready: impl FnMut() -> bool,
    mut on_slow: impl FnMut(),
    mut pause: impl FnMut(),
) -> bool {
    let mut attempts = 0;
    while running() {
        if ready() {
            return true;
        }
        attempts += 1;
        if attempts == 90 {
            on_slow();
        }
        pause();
    }
    false
}

#[cfg(test)]
mod tests {
    use super::wait_for_backend;
    use std::cell::Cell;

    #[test]
    fn health_probe_uses_the_exact_bound_host_and_port() {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        for status in ["200 OK", "400 Bad Request", "503 Service Unavailable"] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                    .unwrap();
                let mut request = Vec::new();
                let mut byte = [0];
                while !request.ends_with(b"\r\n\r\n") {
                    stream.read_exact(&mut byte).unwrap();
                    request.push(byte[0]);
                }
                let request = String::from_utf8(request).unwrap();
                assert!(request.starts_with("GET /health HTTP/1.1\r\n"));
                assert!(request.contains(&format!("\r\nHost: {address}\r\n")));
                let body = "{\"status\":\"ok\",\"mode\":\"client\"}";
                stream.write_all(format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).unwrap();
            });
            assert_eq!(super::backend_ready(address), status == "200 OK");
            server.join().unwrap();
        }
    }

    #[test]
    fn delayed_approval_still_opens_the_app_after_ninety_polls() {
        let probes = Cell::new(0);
        let notices = Cell::new(0);
        let pauses = Cell::new(0);
        assert!(wait_for_backend(
            || true,
            || {
                probes.set(probes.get() + 1);
                probes.get() == 125
            },
            || notices.set(notices.get() + 1),
            || pauses.set(pauses.get() + 1),
        ));
        assert_eq!(notices.get(), 1);
        assert_eq!(pauses.get(), 124);
    }

    #[test]
    fn service_exit_stops_watching_even_if_another_server_is_ready() {
        let mut probed = false;
        assert!(!wait_for_backend(
            || false,
            || {
                probed = true;
                true
            },
            || panic!("a stopped service should not show a slow-start notice"),
            || panic!("a stopped service should not wait"),
        ));
        assert!(!probed);
    }

    #[test]
    fn quitting_during_a_slow_start_stops_watching() {
        let polls = Cell::new(0);
        let notices = Cell::new(0);
        assert!(!wait_for_backend(
            || polls.get() < 100,
            || false,
            || notices.set(notices.get() + 1),
            || polls.set(polls.get() + 1),
        ));
        assert_eq!(notices.get(), 1);
        assert_eq!(polls.get(), 100);
    }
}
