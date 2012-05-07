"use strict";

var util = require("util");
var ShellRunner = require("../cloud9.run.shell/shell").Runner;

/**
 * Run node scripts with restricted user rights
 */

var exports = module.exports = function setup(options, imports, register) {
    var pm = imports["process-manager"];
    var ide = imports.ide.getServer();
    var vfs = imports.vfs;

    pm.addRunner("node", exports.factory(vfs, ide));

    register(null, {
        "run-node": {}
    });
};

exports.factory = function(vfs, ide) {
    return function(args, eventEmitter, eventName) {
        var cwd = args.cwd || ide.workspaceDir;

        return new Runner(vfs, args.file, args.args, cwd, args.env, args.extra, eventEmitter, eventName);
    };
};

var Runner = exports.Runner = function(vfs, file, args, cwd, env, extra, eventEmitter, eventName) {
    this.vfs = vfs;
    this.file = file;
    this.extra = extra;

    this.scriptArgs = args || [];
    this.nodeArgs = [];

    env = env || {};
    ShellRunner.call(this, vfs, process.execPath, [], cwd, env, extra, eventEmitter, eventName);
};

util.inherits(Runner, ShellRunner);

(function() {

    this.name = "node";

    this.createChild = function(callback) {
        this.args = this.nodeArgs.concat(this.file, this.scriptArgs);
        ShellRunner.prototype.createChild.call(this, callback);
    };

}).call(Runner.prototype);