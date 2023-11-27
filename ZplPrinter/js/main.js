const {app, BrowserWindow, dialog, ipcRenderer} = require('electron')
const fs = require('fs');
const $ = require('jquery');
global.$ = $;
global.jQuery = $;
const net = require('net');

let socketId, clientSocketInfo;
let server;
const configs = {};
const pathEntry = null;

const defaults = {
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
    path: null,
    counter: 0
};

$(function () {
    $(window).bind('focus blur', function () {
        $('#panel-head').toggleClass('panel-heading-blur');
    });

    // todo only on first run
    if (!global.localStorage.getItem('isOn')) {
        Object.entries(defaults).forEach(function ([k, v]) {
            if (global.localStorage.getItem(k)) {
                global.localStorage.setItem(k, v);
            }
        });
    }

});

$(document).ready(function () {
    Object.keys(defaults).forEach(function (k) {
        configs[k] = global.localStorage.getItem(k);
    });

    initConfigs();
    initEvents();
});

function getSize(width, height) {
    const defaultWidth = 386;

    const factor = width / height;
    return {
        width: defaultWidth,
        height: defaultWidth / factor
    };
}

async function saveLabel(blob, ext) {
    let items = global.localStorage.getItem('counter');
    let counter = parseInt(items.counter);
    const fileName = `LBL${pad(counter, 6)}.${ext}`;

    global.localStorage.setItem('counter', ++counter);

    // Creating and Writing to the sample.txt file
    fs.writeFile(fileName,
        new Uint8Array(await blob.arrayBuffer()),
        function (err) {
            if (err) throw err;
            notify('Label <b>{0}</b> saved in folder <b>{1}</b>'.format(fileName, $('#txt-path').val()), 'floppy-saved', 'info', 1000);
        });
}

async function fetchAndSavePDF(api_url, zpl) {

    let r1 = await fetch(api_url, {
        method: "POST",
        body: zpl,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/pdf'
        }
    })

    if (r1.ok && r1.status === 200) {
        let blob = await r1.blob()
        await saveLabel(blob, 'pdf');
    } else {
        console.log('error in fetching pdf', `status = ${r1.status}`, await r1.text(), `zpl=${zpl}`)
    }
}

function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

// Display notification
// @param {String} text Notification text
// @param {Number} glyphicon Notification icon
// @param {String} type Notification type
// @param {Number} delay Notification fade out delay in ms
function notify(text, glyphicon, type, delay) {
    const log = $('<p>' + text + '</p>').text();
    if (type === 'danger') {
        console.error(log);
    } else {
        console.info(log);
    }

    $('.bottom-left').notify({
        message: {html: text},
        glyphicon: glyphicon,
        type: type,
        fadeOut: {
            delay: delay == undefined ? 2000 : delay
        }
    }).show();
}

async function displayAndSaveImage(api_url, zpl, width, height, savePng) {
    let r1 = await fetch(api_url, {
        method: "POST",
        body: zpl,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        }
    })

    if (r1.ok && r1.status === 200) {
        const blob = await r1.blob()
        const size = getSize(width, height);
        const img = document.createElement('img');
        img.setAttribute('height', size.height);
        img.setAttribute('width', size.width);
        img.setAttribute('class', 'thumbnail');
        img.onload = function (e) {
            window.URL.revokeObjectURL(img.src);
        };

        img.src = window.URL.createObjectURL(blob);

        $('#label').prepend(img);
        const offset = size.height + 20;
        $('#label').css({'top': `-${offset}px`});
        $('#label').animate({'top': '0px'}, 1500);

        if (savePng) {
            await saveLabel(blob, "png")
        }

    } else {
        console.log('error in fetching image', `status = ${r1.status}`, await r1.text(), `zpl = ${zpl}`)
    }
}

// Start tcp server and listen on configuret host/port
function startTcpServer() {
    if (server != undefined) {
        return;
    }

    server = net.createServer();
    server.listen(parseInt(configs.port), configs.host);

    // chrome.sockets.tcpServer.create({}, function (info) {
    //     socketId = info.socketId;
    //     chrome.sockets.tcpServer.listen(socketId, configs.host, parseInt(configs.port), 20, function (result) {
    //         if (result == 0) {
    notify('Printer started on Host: <b>{0}</b> Port: <b>{1}</b>'.format(configs.host, configs.port));
    // chrome.sockets.tcpServer.onAccept.addListener(function (clientInfo) {
    server.on('connection', function (sock) {
        // socketId = sock;
        console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
        clientSocketInfo = {
            peerAddress: sock.remoteAddress,
            peerPort: sock.remotePort
        };

        sock.on('data', async function (data) {
            // chrome.sockets.tcp.onReceive.addListener(function (info) {
            notify('{0} bytes received from Client: <b>{1}</b> Port: <b>{2}</b>'.format(data.length, clientSocketInfo.peerAddress, clientSocketInfo.peerPort), 'print', 'info', 1000);
            const zpls = String.fromCharCode.apply(null, data).split(/\^XZ/);
            if (!configs.keepTcpSocket) {
                server.close();
            }
            const factor = (configs.unit === '1') ? 1 : (configs.unit === '2') ? 2.54 : 25.4;
            const width = parseFloat(configs.width) / factor;
            const height = parseFloat(configs.height) / factor;

            for (let zpl of zpls) {
                if (!(!zpl || !zpl.length)) {
                    zpl += '^XZ';
                } else {
                    console.warn(`zpl = ${zpl}, seems invalid`)
                    continue
                }

                let api_url = `https://api.labelary.com/v1/printers/${configs.density}dpmm/labels/${width}x${height}/0`;
                console.warn("configs", configs["saveLabels"], "fileType", configs["fileType"])
                let savePdf = configs['saveLabels'] && configs['filetype'] === '2';
                let savePng = configs['saveLabels'] && configs['filetype'] === '1';
                if (savePdf) {
                    await fetchAndSavePDF(api_url, zpl);
                }

                await displayAndSaveImage(api_url, zpl, width, height, savePng);

            }
        });

    });
}

// Stop tcp server
function stopTcpServer() {
    if (server == undefined) {
        return;
    }
    server.close();
    notify('Printer stopped on <b>{0}</b> Port: <b>{1}</b>'.format(configs.host, configs.port));
    server = undefined;
    // chrome.sockets.tcpServer.close(socketId, function () {
    //     notify('Printer stopped on <b>{0}</b> Port: <b>{1}</b>'.format(configs.host, configs.port));
    //     socketId = undefined;
    // });
}

// Init ui events
function initEvents() {
    $('.btn-toggle').click(function () {
        toggleSwitch(this);

        if ($('#btn-on').hasClass('active')) {
            startTcpServer();
        } else {
            stopTcpServer();
        }
    });

    $('#btn-remove').click(function () {
        const size = $('.thumbnail').length;

        if (size > 0) {
            const label = size === 1 ? 'label' : 'labels';
            bootbox.confirm('Are you sure to remove {0} {1}?'.format(size, label), function (result) {
                if (result) {
                    $('.thumbnail').remove();
                    notify('{0} {1} successfully removed.'.format(size, label), 'trash', 'info');
                }
            });
        }
    });
    $('#btn-save-label').click(function () {
        const size = $('.thumbnail').length;

        if (size > 0) {
            const label = size === 1 ? 'label' : 'labels';

        }
    });

    $('#btn-close').click(function () {
        global.localStorage.setItem('isOn', $('#btn-on').hasClass('active'));
        window.close();
        stopTcpServer();
    });

    $('#density li > a').click(function () {
        const btn = $('#btn-density');
        btn.attr('aria-valuenow', $(this).parent().attr('aria-valuenow'));
        btn.html($(this).text() + ' <span class="caret"></span>');
    });

    $('#unit li > a').click(function () {
        const btn = $('#btn-unit');
        btn.attr('aria-valuenow', $(this).parent().attr('aria-valuenow'));
        btn.html($(this).text() + ' <span class="caret"></span>');
    });

    $('#filetype li > a').click(function () {
        const btn = $('#btn-filetype');
        btn.attr('aria-valuenow', $(this).parent().attr('aria-valuenow'));
        btn.html($(this).text() + ' <span class="caret"></span>');
    });

    $('#txt-path').keydown(function (e) {
        e.preventDefault();
    });

    $('#configsForm').submit(function (e) {
        e.preventDefault();
        saveConfigs();

    });

    $('#settings-window').on('shown.bs.modal', function () {
        if ($('#btn-on').hasClass('active')) {
            toggleSwitch('.btn-toggle');
            stopTcpServer();
        }
    });

    $('#ckb-saveLabels').change(function () {
        const disabled = !$(this).is(':checked');
        $('#btn-filetype').prop('disabled', disabled);
        $('#btn-path').prop('disabled', disabled);
        $('#txt-path').prop('disabled', disabled);
    });

    $('#btn-path').click(function (e) {
        // chrome.fileSystem.chooseEntry({
        //     type: 'openDirectory',
        // }, function (entry) {
        //     if (chrome.runtime.lastError) {
        //         console.info(chrome.runtime.lastError.message);
        //     } else {
        //         initPath(entry);
        //         pathEntry = entry;
        //         retainEntry = chrome.fileSystem.retainEntry(entry);
        //     }
        // });
        e.preventDefault()

        ipcRenderer.send('select-dirs')
        ipcRenderer.on('selected-dirs', (event, response) => {
            if (response && typeof Array.isArray(response)) {
                document.getElementById('txt-path').value = response[0]
            }
        })
    });
}

// Toggle on/off switch
// @param {Dom Object} btn Button group to toggle
function toggleSwitch(btn) {
    $(btn).find('.btn').toggleClass('active');

    if ($(btn).find('.btn-primary').length > 0) {
        $(btn).find('.btn').toggleClass('btn-primary');
    }

    $(btn).find('.btn').toggleClass('btn-default');
}

// Svae configs in local storage
function saveConfigs() {
    for (let key in configs) {
        if (key == 'density') {
            configs[key] = $('#btn-density').attr('aria-valuenow');
        } else if (key == 'unit') {
            configs[key] = $('#btn-unit').attr('aria-valuenow');
        } else if (key == 'filetype') {
            configs[key] = $('#btn-filetype').attr('aria-valuenow');
        } else if (key == 'saveLabels') {
            configs[key] = $('#ckb-saveLabels').is(':checked');
        } else if (key == 'keepTcpSocket') {
            configs[key] = $('#ckb-keep-tcp-socket').is(':checked');
        } else if (key == 'path') {
            configs[key] = document.getElementById('txt-path').value;
        } else {
            configs[key] = $('#' + key).val();
        }
    }

    Object.entries(configs).forEach(function ([k, v]) {
        global.localStorage.setItem(k, v);
    });

    $('#settings-window').modal('hide');
    notify('Printer settings changes successfully saved', 'cog', 'info');
}

// Init/load configs from local storage
function initConfigs() {
    console.log('init', configs)
    for (let key in configs) {
        if (key === 'density') {
            initDropDown('density', configs[key]);
        } else if (key === 'unit') {
            initDropDown('unit', configs[key]);
        } else if (key === 'filetype') {
            initDropDown('filetype', configs[key]);
        } else if (key === 'saveLabels') {
            $('#ckb-saveLabels').prop('checked', configs[key]);
            const disabled = !configs[key];
            $('#btn-filetype').prop('disabled', disabled);
            $('#btn-path').prop('disabled', disabled);
            $('#txt-path').prop('disabled', disabled);
        } else if (key === 'isOn' && configs[key]) {
            toggleSwitch('.btn-toggle');
            startTcpServer();
        } else if (key === 'keepTcpSocket') {
            $('#ckb-keep-tcp-socket').prop('checked', configs[key]);
        } else if (key === 'path' && configs[key]) {
            document.getElementById('txt-path').value = configs[key]
        } else {
            $('#' + key).val(configs[key]);
        }
    }
}


function initDropDown(btnId, value) {
    const btn = $('#btn-' + btnId);
    const text = $('#' + btnId).find('li[aria-valuenow=' + value + '] > a').html();
    btn.attr('aria-valuenow', value);
    btn.html(text + ' <span class="caret"></span>');
}

// Prototype for string.format method
String.prototype.format = function () {
    let s = this,
        i = arguments.length;

    while (i--) {
        s = s.replace(new RegExp('\\{' + i + '\\}', 'gm'), arguments[i]);
    }
    return s;
};
