#!/usr/bin/env node

var https = require('https'),
    irc = require('irc'),
    qs = require('querystring'),
    options = require('nomnom').opts({
        host: {
            abbr: 'H',
            help: 'IRC network to connect to.'
        },
        nick: {
            abbr: 'n',
            default: 'krasula',
            help: 'IRC nickname.'
        },
        channels: {
            abbr: 'c',
            help: 'Channels to join. Comma-separated, no #.'
        }
    }).parseArgs();


var channels = options.channels.split(',');
for (var i = 0; i < channels.length; i++) {
    var c = channels[i];
    channels[i] = '#' + c.trim();
}

var client = new irc.Client(options.host, options.nick, {
    'channels': channels,
});

client.addListener('error', function(err) {
    if (err.rawCommand != '421') console.log(err);
});

client.addListener('pm', function(from, msg) {
    console.log(from + ' => ME: ' + msg);
});

client.addListener('message', function (from, to, msg) {
    console.log(from + ' => ' + to + ': ' + msg);
    var parts = msg.trim().split(/\s+/);
    if (parts.shift() != 'krasula:') return;
    client.say(to, from + ': ' + parts.join(' '));
});
