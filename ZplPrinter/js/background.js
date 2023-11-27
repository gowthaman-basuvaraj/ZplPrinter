chrome.app.runtime.onLaunched.addListener(function () {
    chrome.app.window.create('main.html', {
        frame: 'chrome'
    });
});

chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason === "install" || details.reason === "update") {
        chrome.storage.local.set({
            isOn: true,
            density: '8',
            width: '4',
            height: '6',
            unit: '1',
            host: '127.0.0.1',
            port: '9100',
            bufferSize: '4096',
            keepTcpSocket: false,
            saveLabels: false,
            filetype: '1',
            path: "/tmp",
	        counter: 0
        });
    }
});