#!/usr/bin/env node

var io = require("socket.io");
var fs = require("fs");
var amqp = require("amqp");
var extend = require("extend");


function subscribe(amqp_connection, extra_headers, callback, socket){
    extra_headers = typeof extra_headers !== "undefined" ? extra_headers : {};
    callback = typeof callback !== "undefined" ? callback : function(message, headers, deliveryInfo){
            console.log("Headers: ", headers);
            //console.log("Message: ", message.data.toString());
    };
    socket = typeof socket !== "undefined" ? socket : null;

    var headers = {
        "x-match": "all",
        "ns": "auditor"
    };

    extend(headers, extra_headers);

    amqp_connection.queue("", {"autoDelete": true}, function(queue){
        queue.bind_headers("amq.headers", headers);
        queue.subscribe(callback);
    });

    if (socket){
        socket.on("disconnect", function(){
            console.log("Client disconnected.");
            queue.destroy();
        });
    }
}


function get_rabbit_creds(creds_file){
    var creds = {
        "login": "guest",
        "password": "guest"
    };
    if (!creds_file) {
        return creds;
    }

    var data = fs.readFileSync(creds_file);
    data = data.split("\n")[0].split(":")
    creds.login = data[0]
    creds.password = data[1]

    return creds;
}


function main(){
    var optimist = require("optimist")
        .usage("WebSocket Server for Auditor")
        .default({
            "port": 8001,
            "rabbitmq_host": "localhost",
            "rabbitmq_port": "5672",
            "rabbitmq_credentials_file": null,
            "rabbitmq_vhost": "/",
        })
        .describe("h", 'Display this help message.')
        .alias("h", "help")
        ;

    var argv = optimist.argv;

    if (argv.help) {
        optimist.showHelp();
        process.exit(0);
    }

    var iosocket = io.listen(argv.port);
    iosocket.set("log level", 1)

    var rabbit_options = {
        "host": argv.rabbitmq_host,
        "port": argv.rabbitmq_port,
        "vhost": argv.rabbitmq_vhost
    }
    extend(rabbit_options, get_rabbit_creds(argv.rabbitmq_credentials_file));

    var connection = amqp.createConnection(rabbit_options);

    connection.on("ready", function(){

        console.log("Subscribing to all events.");
        subscribe(connection);

        iosocket.sockets.on("connection", function(socket) {

            console.log("Client connected.");

            socket.on("subscribe", function(data){
                console.log("Client subscription: ", data)
                subscribe(connection, data, function(message, headers, deliveryInfo){
                    socket.emit(headers.ns + "." + headers.type + "." + headers.cmd, message.data.toString());
                });
            });
        });
    });
}

main();
