// SPDX-License-Identifier: AGPL-3.0-or-later

use std::io::{ErrorKind, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

/// A keychain approval may take minutes. Keep partial bytes across polling
/// timeouts and stop only when our service exits, the connection ends, or replies.
fn read_status(mut reader: impl Read, mut running: impl FnMut() -> bool) -> Option<u16> {
    let mut status = Vec::new();
    while running() && status.len() < 1024 {
        let mut byte = [0];
        match reader.read(&mut byte) {
            Ok(0) => return None,
            Ok(_) if byte[0] == b'\n' => {
                let line = std::str::from_utf8(&status).ok()?;
                let mut parts = line.split_whitespace();
                if !matches!(parts.next(), Some("HTTP/1.1" | "HTTP/1.0")) {
                    return None;
                }
                return parts.next()?.parse().ok();
            }
            Ok(_) => status.push(byte[0]),
            Err(error)
                if matches!(
                    error.kind(),
                    ErrorKind::TimedOut | ErrorKind::WouldBlock | ErrorKind::Interrupted
                ) => {}
            Err(_) => return None,
        }
    }
    None
}

pub fn post_callback(
    address: SocketAddr,
    callback: &str,
    running: impl FnMut() -> bool,
) -> Option<u16> {
    let body = serde_json::to_string(&serde_json::json!({ "callback": callback })).ok()?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2)).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(1))).ok()?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .ok()?;
    let request = format!("POST /api/setup/moodle/callback HTTP/1.1\r\nHost: {address}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
    stream.write_all(request.as_bytes()).ok()?;
    read_status(stream, running)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::io::{self, Cursor};

    struct DelayedReply(VecDeque<io::Result<u8>>);
    impl Read for DelayedReply {
        fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
            match self.0.pop_front() {
                Some(Ok(byte)) => {
                    output[0] = byte;
                    Ok(1)
                }
                Some(Err(error)) => Err(error),
                None => Ok(0),
            }
        }
    }

    #[test]
    fn delayed_keychain_reply_keeps_partial_status_after_more_than_sixty_timeouts() {
        let mut steps = VecDeque::from_iter(b"HTTP/1.1 ".iter().copied().map(Ok));
        for _ in 0..125 {
            steps.push_back(Err(io::Error::from(ErrorKind::TimedOut)));
        }
        steps.extend(b"200 OK\r\n".iter().copied().map(Ok));
        assert_eq!(read_status(DelayedReply(steps), || true), Some(200));
    }

    #[test]
    fn service_exit_or_closed_connection_is_not_success() {
        assert_eq!(
            read_status(Cursor::new(b"HTTP/1.1 200 OK\r\n"), || false),
            None
        );
        assert_eq!(read_status(Cursor::new(b"HTTP/1.1 20"), || true), None);
        assert_eq!(read_status(Cursor::new(b"invalid 200\n"), || true), None);
    }
}
