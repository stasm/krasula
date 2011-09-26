#!/usr/bin/env node

var irc = require('irc');
var bz = require('bz');
var redis = require('redis');

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

var bmo = bz.createClient();
var store = redis.createClient();
var bot = new irc.Client(options.host, options.nick, {
    'channels': channels,
});

store.on("error", function (err) {
    console.log("Redis error " + err);
});

bot.addListener('error', function(err) {
    if (err.rawCommand != '421') console.log(err);
});

bot.addListener('message', function (from, to, msg) {
    var BMO_RE = /bug (\d{1,7})/g;
    var BAP_RE = /bap (\d{1,5})/g;

    var uniques = [];
    var results;
    while (results = BMO_RE.exec(msg)) {
        var bugid = results[1];
        if (uniques.indexOf(bugid) > -1) continue;
        uniques.push(bugid);
        bmo.getBug(bugid, function(error, bug) {
            if (error) {
                console.log(error);
                return;
            }
            var status = bug.status;
            if (status == 'RESOLVED' ||
                status == 'VERIFIED')
                status += ' ' + bug.resolution;
            bot.say(to, from + ': http://bugzil.la/' + bug.id + 
                       ' - ' + bug.summary + ' - ' + status);
        });
    }
});

bot.addListener('message', function (from, to, msg) {
    var INCR = /(\w+)\+\+/g;
    var DECR = /(\w+)\-\-/g;
    var uniques = [];

    if (to == 'krasula') return;

    while (results = INCR.exec(msg)) {
        var who = results[1];
        if (who == from) continue;
        if (uniques.indexOf(who) > -1) continue;
        uniques.push(who);
        console.log(who + '++');
        store.incr('karma_' + who);
    }
    while (results = DECR.exec(msg)) {
        var who = results[1];
        if (who == from) continue;
        if (uniques.indexOf(who) > -1) continue;
        uniques.push(who);
        console.log(who + '--');
        store.decr('karma_' + who);
    }
});

bot.addListener('message', function (from, to, msg) {
    var parts = msg.trim().split(/\s+/);
    if (parts.shift() != 'krasula:') return;
    if (parts.shift() != 'karma') return;
    var who = parts.shift();
    store.get('karma_' + who, function(err, res) {
        bot.say(to, who + ' has ' + res + ' karma');
    });
});

bot.addListener('part', function (channel, who, reason) {
    console.log(who + ' has left');
    store.set('part_' + who, Date.now());
});

bot.addListener('message', function (from, to, msg) {
    var parts = msg.trim().split(/\s+/);
    if (parts.shift() != 'krasula:') return;
    if (parts.shift() != 'part') return;
    var who = parts.shift();
    store.get('part_' + who, function(err, res) {
        var when = new Date(parseInt(res));
        bot.say(to, who + ' has left on ' + when.toString());
    });
});

bot.addListener('message', function (from, to, msg) {
    var parts = msg.trim().split(/\s+/);
    if (parts.shift() != 'krasula:') return;
    if (parts.shift() != 'zdrowie') return;
    bot.say(to, from + ': pijmy bo się ściemnia. Zdrowie!');
});
