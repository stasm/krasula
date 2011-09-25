#!/usr/bin/env node

var irc = require('irc');
var bz = require('bz');

var bmo = bz.createClient();

var BMO_RE = /bug (\d{1,7})/g;
var BAP_RE = /bap (\d{1,5})/g;

var options = require('nomnom').opts({
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
    msg = msg.trim();
    var results;
    while (results = BMO_RE.exec(msg)) {
        var bugid = results[1];
        bmo.getBug(bugid, function(error, bug) {
            if (error) {
                console.log(error);
                return;
            }
            var status = bug.status;
            if (status == 'RESOLVED')
                status += ' ' + bug.resolution;
            client.say(to, from + ': http://bugzil.la/' + bug.id + 
                       ' - ' + bug.summary + ' - ' + status);
        });
    }
    var parts = msg.split(/\s+/);
    if (parts.shift() != 'krasula:') return;
    client.say(to, from + ': ' + parts.join(' '));
});
