use reqwest::header::HeaderMap;
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
};

#[test]
fn test_mihomo_manager_init() {
    let _ = mihomo_api::MihomoManager::new("url".into(), HeaderMap::new());
    assert_eq!(true, true);
}

#[tokio::test(flavor = "current_thread")]
async fn put_configs_force_returns_http_error_body() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let error_message = "path is not subpath of home directory or SAFE_PATHS: /fixtures/account-a/work/config.yaml\nallowed paths: [/fixtures/account-b/work]";
    let body = serde_json::json!({ "message": error_message }).to_string();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let _ = stream.read(&mut [0; 2048]).unwrap();
        write!(
            stream,
            "HTTP/1.1 400 Bad Request\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
    });

    let manager = mihomo_api::MihomoManager::new(format!("http://{address}"), HeaderMap::new());
    let error = manager
        .put_configs_force("/fixtures/account-a/work/config.yaml")
        .await
        .expect_err("HTTP 400 must fail");

    assert_eq!(error, error_message);
    server.join().unwrap();
}
