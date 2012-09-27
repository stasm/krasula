#!/usr/bin/env node

var irc = require('irc');
var bz = require('bz');
var bzJson = require('bz-json');
var redis = require('redis');

var getPolishForm = function(number, str0, str1, str2) {
    if (number == 1) {
        return str1;
    }

    var numberd = number % 10;
    var numbers = number % 100;
    if ((numberd <= 1) || (numberd > 4) || (numbers > 10 && numbers < 20)) {
        return str0;
    }

    return str2; 
}

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
        },
        redisport: {
            abbr: 'r',
            default: 6379,
            help: 'Redis port number.'
        }
    }).parseArgs();

var channels = options.channels.split(',');
for (var i = 0; i < channels.length; i++) {
    var c = channels[i];
    channels[i] = '#' + c.trim();
}

var bmo = bz.createClient();
var bap = bzJson.createClient({ 
    url: "http://bugs.aviary.pl/jsonrpc.cgi"
});
var store = redis.createClient(options.redisport);

console.log('Connecting...');
var bot = new irc.Client(options.host, options.nick, {
    'channels': channels,
});
bot.on('join', function(channel, nick) {
    if (nick == options.nick) {
        console.log('Connected!');
    }

    store.set('nick_' + nick, true);
});

store.on("error", function (err) {
    console.log("Redis error " + err);
});

bot.addListener('error', function(err) {
    if (err.rawCommand != '421') console.log(err);
});

bot.addListener('names', function(channel, nicks) {
    if (nicks) {
        for (var nick in nicks) {
            store.set('nick_' + nick, true);
        }
    }
});

bot.addListener('quit', function (channel, who, reason) {
    console.log(who + ' has left');
    store.set('quit_' + who, Date.now());
    store.del('nick_' + who, null);
});

bot.addListener('part', function (channel, who, reason) {
    console.log(who + ' has left');
    store.set('quit_' + who, Date.now());
    store.del('nick_' + who, null);
});

bot.addListener('message', function (from, channel, msg) {
    if (channel == options.nick) return;

    var BMO_RE = /(?:bug|bmo) (\d{1,7})/g;
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
                bot.say(channel, from + ': Nie znaleziono błędu o numerze ' + bugid +' na bmo');
                return;
            }
            var status = bug.status;
            if (status == 'RESOLVED' ||
                status == 'VERIFIED')
                status += ' ' + bug.resolution;
            bot.say(channel, from + ': https://bugzil.la/' + bug.id + 
                    ' - ' + bug.summary + ' - ' + status);
        });
    }
    while (results = BAP_RE.exec(msg)) {
        var bugid = results[1];
        if (uniques.indexOf(bugid) > -1) continue;
        uniques.push(bugid);
        bap.getBug(bugid, function(error, bug) {
            if (error) {
                console.log(error);
                bot.say(channel, from + ': Nie znaleziono błędu o numerze ' + bugid +' na bap');
                return;
            }
            var bug = bug.result.bugs[0]
            var status = bug.status;
            if (status == 'RESOLVED' ||
                status == 'VERIFIED')
                status += ' ' + bug.resolution;
            bot.say(channel, from + ': http://bugs.aviary.pl/show_bug.cgi?id=' + bug.id +
                    ' - ' + bug.summary + ' - ' + status);
        });
    }
});

bot.addListener('message', function (from, channel, msg) {
    if (channel == options.nick) return;

    var INCR = /(\w+)\+\+/g;
    var DECR = /(\w+)\-\-/g;
    var uniques = [];

    var results;
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

bot.addListener('message', function (from, channel, msg) {
    if (channel == options.nick) return;

    var parts = msg.trim().split(/\s+/);
    if (parts.shift() != options.nick + ':') return;
    if (parts.shift() != 'karma') return;
    var who = parts.shift();
    store.get('karma_' + who, function(err, res) {
        if (!res) {
            res = 0;
        }
        var msg;
        if (res == 0) {
            msg = who + ' nie ma jeszcze mleka';
        }
        else if (res < 0) {
            res = res * (-1);
            var karma = getPolishForm(res, 'litrów mleka', 'litr mleka', 'litry mleka');
            msg = who + ' wisi ' + res + ' ' + karma;
        }
        else {
            var karma = getPolishForm(res, 'litrów mleka', 'litr mleka', 'litry mleka');
            msg = who + ' ma ' + res + ' ' + karma;
        }
        bot.say(channel, msg);
    });
});

bot.addListener('message', function (from, channel, msg) {
    if (channel == options.nick) return;

    var parts = msg.trim().split(/\s+/);
    if (parts.shift() != options.nick + ':') return;
    if (parts.shift() != 'seen') return;
    var who = parts.shift();
    store.get('nick_' + who, function(err, res) {
        if (res) {
            bot.say(channel, who + ' jest w tej chwili na kanale');
        }
        else {
            store.get('quit_' + who, function(err, res) {
                if (res) {
                    var when = new Date(parseInt(res));
                    bot.say(channel, who + ' opuścił kanał ostatnio dnia ' + when.toString());
                }
                else {
                    bot.say(channel, who + ' mnie jeszcze nie doił(a) :(');
                }
            });
        }
    });
});

bot.addListener('message', function (from, channel, msg) {
    if (channel == options.nick) return;

    var parts = msg.trim().split(/\s+/);
    if (parts.shift() != options.nick + ':') return;
    if (parts.shift() != 'zdrowie') return;
    bot.say(channel, from + ': pijmy bo się ściemnia. Zdrowie!');
});
