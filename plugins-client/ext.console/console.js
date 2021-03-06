/**
 * Console for the Cloud9 IDE
 *
 * @copyright 2012, Cloud9 IDE, Inc.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 * @contributor Sergi Mansilla <sergi AT c9 DOT io>
 */

define(function(require, exports, module) {

var editors, parseLine, predefinedCmds; // These modules are loaded on demand
var ide = require("core/ide");
var menus = require("ext/menus/menus");
var commands = require("ext/commands/commands");
var ext = require("core/ext");
var settings = require("core/settings");
var logger = require("ext/console/logger");
var css = require("text!ext/console/console.css");
var markup = require("text!ext/console/console.xml");
var theme = require("text!ext/console/themes/arthur.css");
var inputHistory = require("ext/console/input_history");

// Some constants used throughout the plugin
var KEY_TAB = 9, KEY_CR = 13, KEY_UP = 38, KEY_ESC = 27, KEY_DOWN = 40;
var actionCodes = [KEY_TAB, KEY_CR, KEY_UP, KEY_ESC, KEY_DOWN];

module.exports = ext.register("ext/console/console", {
    name   : "Console",
    dev    : "Cloud9 IDE, Inc.",
    type   : ext.GENERAL,
    alone  : true,
    markup : markup,
    css    : css + theme,
    height : 200,
    hidden : true,

    cliInputHistory : new inputHistory(),

    command_id_tracer : 1,
    tracerToPidMap : {},
    pidToTracerMap : {},
    hiddenInput : true,

    nodes : [],

    minHeight : 150,
    maxHeight: window.innerHeight - 70,

    collapsedHeight : 31,
    $collapsedHeight : 0,

    autoOpen : true,
    excludeParent : true,
    keyEvents: {},

    onMessageMethods: {
        cd: function(message, outputElDetails) {
            var res = message.body;
            if (res.cwd) {
                this.$cwd = res.cwd.replace(ide.workspaceDir, "/workspace");
                logger.logNodeStream("Working directory changed", null, outputElDetails, ide);
            }
        },

        error: function(message, outputElDetails) {
            logger.logNodeStream(message.body, null, outputElDetails, ide);
        },

        info: function (message, outputElDetails) {
            logger.logNodeStream(message.body, null, outputElDetails, ide);
        },

        __default__: function(message, outputElDetails) {
            var res = message.body;
            if (res) {
                res.out && logger.logNodeStream(res.out, null, outputElDetails, ide);
                res.err && logger.logNodeStream(res.err, null, outputElDetails, ide);
            }
        }
    },

    getLogStreamOutObject : function(tracer_id, idIsPid) {
        if (idIsPid)
            tracer_id = this.pidToTracerMap[tracer_id];
        var id = "section" + tracer_id;
        return {
            $ext : document.getElementById("console_" + id),
            id : id
        };
    },

    help: function(data) {
        var words = Object.keys(commands.commands);
        var tabs = "\t\t\t\t";

        logger.logNodeStream(
            words.sort()
                .map(function(w) { return w + tabs + commands.commands[w].hint; })
                .join("\n"),
            null, this.getLogStreamOutObject(data.tracer_id), ide
        );
    },

    clear: function() {
        if (txtConsole)
            txtConsole.clear();

        return false;
    },

    switchconsole : function() {
        if (apf.activeElement === self.txtConsoleInput) {
            var page = tabEditors.getPage();
            if (page) {
                if (page.$editor.focus)
                    page.$editor.focus();
            }
        }
        else {
            if (this.hiddenInput)
                this.showInput(true);
            else
                txtConsoleInput.focus();
        }
    },

    showOutput: function() {
        tabConsole.set(1);
    },

    getCwd: function() {
        return this.$cwd && this.$cwd.replace("/workspace", ide.workspaceDir);
    },

    write: function(lines, data) {
        if (typeof lines === "string")
            lines = lines.split("\n");

        var lsOutObject = this.getLogStreamOutObject(data.tracer_id);
        lines.forEach(function(line) {
            logger.logNodeStream(line, null, lsOutObject, ide);
        });
    },

    commandTextHandler: function(e) {
        var code = e.keyCode;
        if (this.keyEvents[code])
            this.keyEvents[code](e.currentTarget);
    },

    keyupHandler: function(e) {
        if (actionCodes.indexOf(e.keyCode) !== -1)
            return this.commandTextHandler(e);
    },

    keydownHandler: function(e) {
        if (actionCodes.indexOf(e.keyCode) === -1)
            return this.commandTextHandler(e);
    },

    createOutputBlock: function(line, useOutput) {
        var spinnerBtn = ['<div class="prompt_spinner"', ' id="spinner', this.command_id_tracer,
            '" onclick="return require(\'ext/console/console\').handleOutputBlockClick(event)"></div>']
            .join("");

        var outputId = "console_section" + this.command_id_tracer;
        logger.log(line, "prompt", spinnerBtn, '<div class="prompt_spacer"></div>', useOutput, outputId);

        var outputEl = document.getElementById(outputId);
        apf.setStyleClass(outputEl, "loading");

        return this.command_id_tracer;
    },

    evalInputCommand: function(line) {
        parseLine || (parseLine = require("ext/console/parser"));
        var argv = parseLine(line);
        if (!argv || argv.length === 0) // no commmand line input
            return;

        // Replace any quotes in the command
        argv[0] = argv[0].replace(/["'`]/g, "");
        this.cliInputHistory.push(line);

        this.createOutputBlock(this.getPrompt(line));

        tabConsole.set("console");

        var showConsole = true;
        var cmd = argv[0];

        if (!predefinedCmds)
            predefinedCmds = require("ext/console/output");
        var defCmd = predefinedCmds.getPredefinedOutput(argv);
        if (defCmd !== "") {
            this.markProcessAsCompleted(this.command_id_tracer);
            logger.logNodeStream(defCmd, null,
                this.getLogStreamOutObject(this.command_id_tracer), ide);
            this.command_id_tracer++;
        }
        else {
            var data = {
                command: cmd,
                argv: argv,
                line: line,
                cwd: this.getCwd(),
                requireshandling: true,
                tracer_id: this.command_id_tracer
            };

            if (cmd.trim() === "npm")
                data.version = settings.model.queryValue("auto/node-version/@version") || "auto";

            showConsole = this.sendCommandToExtensions(cmd, data);
        }

        if (showConsole === true)
            this.show();
    },

    sendCommandToExtensions : function(cmd, data) {
        ide.dispatchEvent("track_action", {
            type: "console",
            cmd: cmd,
            argv: data.argv
        });

        // If no local extensions handle the command, send it server-side for
        // those extensions to handle it
        if (ext.execCommand(cmd, data) !== false) {
            var commandEvt = "consolecommand." + cmd;
            var consoleEvt = "consolecommand";
            var commandEvResult = ide.dispatchEvent(commandEvt, { data: data });
            var consoleEvResult = ide.dispatchEvent(consoleEvt, { data: data });

            if (commandEvResult !== false && consoleEvResult !== false) {
                if (!ide.onLine) {
                    this.write("Cannot send command to server. You are currently offline.", {
                        tracer_id : this.command_id_tracer
                    });
                }
                else {
                    data.extra = {
                        command_id : this.command_id_tracer
                    };

                    ide.send(data);
                }
            }
            else {
                // Return false to `evalInputCommand` to not show the output area
                return false;
            }
        }

        this.command_id_tracer++;
        return true;
    },

    markProcessAsCompleted: function(id, idIsPid) {
        if (idIsPid)
            id = this.pidToTracerMap[id];
        var spinnerElement = document.getElementById("spinner" + id);
        if (spinnerElement) {
            var pNode = spinnerElement.parentNode;
            if (pNode.className.indexOf("quitting") !== -1) {
                apf.setStyleClass(pNode, "quit_proc", ["quitting_proc"]);
                logger.logNodeStream("Process successfully quit", null,
                    this.getLogStreamOutObject(id), ide);
            }

            Firmin.animate(spinnerElement, {
                opacity : 0,
                delay : 0.2 },
            0.3, function() {
                spinnerElement.setAttribute("style", "");
                apf.setStyleClass(spinnerElement.parentNode, "loaded", ["loading"]);
                setTimeout(function() {
                    spinnerElement.style.opacity = "1";
                }, 100);
            });
        }
    },

    onMessage: function(e) {
        if (!e.message.type)
            return;

        var message = e.message;
        var extra = message.extra;
        if (!extra && message.body)
            extra = message.body.extra;

        switch(message.type) {
            case "node-start":
                var command_id = this.createOutputBlock("Running Node Process", true);
                this.tracerToPidMap[command_id] = message.pid;
                this.pidToTracerMap[message.pid] = command_id;

                var containerEl = this.getLogStreamOutObject(command_id).$ext;
                containerEl.setAttribute("rel", command_id);
                apf.setStyleClass(containerEl, "has_pid");

                if (window.cloud9config.hosted) {
                    var url = location.protocol + "//" +
                        ide.workspaceId.replace(/(\/)*user(\/)*/, '').split("/").reverse().join(".") +
                        "." + location.host;
                    logger.logNodeStream("Tip: you can access long running processes, like a server, at '" + url +
                        "'.\nImportant: in your scripts, use 'process.env.PORT' as port and '0.0.0.0' as host.\n ",
                        null, this.getLogStreamOutObject(message.pid, true), ide);
                }

                this.command_id_tracer++;
                return;
            case "node-data":
                logger.logNodeStream(message.data, message.stream,
                    this.getLogStreamOutObject(message.pid, true), ide);
                return;
            case "node-exit":
                this.markProcessAsCompleted(message.pid, true);
                return;
            case "kill":
                if (message.err) {
                    logger.logNodeStream(message.err, null,
                        this.getLogStreamOutObject(extra.command_id), ide);
                }
                break;
            default:
                if (message.type.match(/-start$/)) {
                    var command_id = extra && extra.command_id;
                    
                    if (!command_id) {
                        return;
                    }

                    this.tracerToPidMap[command_id] = message.pid;
                    this.pidToTracerMap[message.pid] = command_id;

                    var containerEl = this.getLogStreamOutObject(command_id).$ext;
                    containerEl.setAttribute("rel", command_id);
                    apf.setStyleClass(containerEl, "has_pid");
                    return;
                }

                if (message.type.match(/-data$/)) {
                    var type = "tracer";
                    var id = extra && extra.command_id;
                    if (!id) {
                        type = "pid";
                        id = message.pid;
                    }

                    logger.logNodeStream(message.data, message.stream,
                        this.getLogStreamOutObject(id, type === "pid"), ide);
                    return;
                }

                if (message.type.match(/-exit$/)) {
                    if (extra && extra.command_id)
                        this.markProcessAsCompleted(extra.command_id);
                    else
                        this.markProcessAsCompleted(message.pid, true);
                    return;
                }
                break;
        }

        // If we get to this point and `extra` is available, it's a process that
        // sends all its stdout _after_ it has quit. Thus, we complete it here
        if (extra)
            this.markProcessAsCompleted(extra.command_id);

        if (message.type !== "result")
            return;

        var outputElDetails;
        if (extra)
            outputElDetails = this.getLogStreamOutObject(extra.command_id);
        if (this.onMessageMethods[message.subtype])
            this.onMessageMethods[message.subtype].call(this, message, outputElDetails);
        else
            this.onMessageMethods.__default__.call(this, message, outputElDetails);

        ide.dispatchEvent("consoleresult." + message.subtype, {
            data: message.body
        });
    },

    getPrompt: function(suffix) {
        var u = this.username;
        if (!u)
            u = (ide.workspaceId.match(/user\/(\w+)\//) || [,"guest"])[1];

        return "[" + u + "@cloud9]:" + this.$cwd + "$" + ((" " + suffix) || "");
    },

    hook: function() {
        var _self = this;
        
        // Append the console window at the bottom below the tab
        this.markupInsertionPoint = mainRow;

        commands.addCommand({
            name: "help",
            hint: "show general help information and a list of available commands",
            exec: function () {
                _self.help();
            }
        });

        commands.addCommand({
            name: "clear",
            hint: "clear all the messages from the console",
            exec: function () {
                _self.clear();
            }
        });
        commands.addCommand({
            name: "switchconsole",
            bindKey: {mac: "Shift-Esc", win: "Shift-Esc"},
            hint: "toggle focus between the editor and the command line",
            exec: function () {
                _self.switchconsole();
            }
        });

        commands.addCommand({
            name: "toggleconsole",
            bindKey: {mac: "Ctrl-Esc", win: "F6"},
            exec: function () {
                if (_self.hidden)
                    _self.show();
                else
                    _self.hide();
            }
        });

        commands.addCommand({
            name: "toggleinputbar",
            exec: function () {
                if (_self.hiddenInput)
                    _self.showInput();
                else
                    _self.hideInput();
            }
        });

        this.nodes.push(
            menus.addItemByPath("Goto/Switch to Command Line", new apf.item({
                command : "switchconsole"
            }), 350),

            this.mnuItemConsoleExpanded = menus.addItemByPath("View/Console", new apf.item({
                type    : "check",
                command : "toggleconsole",
                checked : "[{require('ext/settings/settings').model}::auto/console/@expanded]"
            }), 700),
            this.mnuItemInput = menus.addItemByPath("View/Command Line", new apf.item({
                type    : "check",
                command : "toggleinputbar",
                checked : "[{require('ext/settings/settings').model}::auto/console/@showinput]"
            }), 800)
        );
        
        menus.addItemByPath("Tools/~", new apf.divider(), 30000);
        
        var cmd = {
            "Git" : [
                ["Status", "git status"],
                ["Push", "git push"],
                ["Pull", "git pull"],
                ["Stash", "git stash"],
                ["Commit", "git commit -m ", null, null, true],
                ["Checkout", "git checkout ", null, null, true]
            ],
            "Hg" : [
                ["Sum", "hg sum"],
                ["Push", "hg push"],
                ["Pull", "hg pull"],
                ["Status", "hg status"],
                ["Commit", "hg commit -m ", null, null, true],
                ["Parents", "hg parents ", null, null, true]
            ],
            "Npm" : [
                ["Install", "npm install"],
                ["Uninstall", "npm uninstall", null, null, true]
            ]
        };
        
        var idx = 40000;
        Object.keys(cmd).forEach(function(c) {
            menus.addItemByPath("Tools/" + c + "/", null, idx += 1000);
            var list = cmd[c];
            
            var idx2 = 0;
            list.forEach(function(def) {
                menus.addItemByPath("Tools/" + c + "/" + def[0], 
                    new apf.item({
                        onclick : function(){
                            _self.showInput();
                            txtConsoleInput.setValue(def[1]);
                            if (!def[4]) {
                                _self.keyEvents[KEY_CR](txtConsoleInput);
                                txtConsole.$container.scrollTop = txtConsole.$container.scrollHeight;
                            }
                            txtConsoleInput.focus();
                        }
                    }), idx2 += 100);
            });
        });

        ide.addEventListener("settings.load", function(e){
            if (!e.model.queryNode("auto/console/@autoshow"))
                e.model.setQueryValue("auto/console/@autoshow", true);

            _self.height = e.model.queryValue("auto/console/@height") || _self.height;

            if (apf.isTrue(e.model.queryValue("auto/console/@maximized"))) {
                _self.show(true);
                _self.maximizeConsoleHeight();
            }
            else if (apf.isTrue(e.model.queryValue("auto/console/@expanded")))
                _self.show(true);

            if (apf.isTrue(e.model.queryValue("auto/console/@showinput")))
                _self.showInput(null, true);
        });

        stProcessRunning.addEventListener("activate", function() {
            var autoshow = settings.model.queryValue("auto/console/@autoshow");
            if (_self.autoOpen && apf.isTrue(autoshow)) {
                setTimeout(function(){
                    _self.show();
                    _self.showOutput();
                }, 200);
            }
        });
    },

    init: function(){
        var _self = this;

        this.$cwd  = "/workspace"; // code smell

        apf.importCssString(this.css);

        this.splitter = mainRow.insertBefore(new apf.splitter({
            scale : "bottom",
            visible : false
        }), winDbgConsole);

        ide.addEventListener("socketMessage", this.onMessage.bind(this));
        ide.addEventListener("consoleresult.internal-isfile", function(e) {
            var data = e.data;
            var path = data.cwd.replace(ide.workspaceDir, ide.davPrefix);
            if (!editors)
                editors = require("ext/editors/editors");
            if (data.isfile)
                editors.showFile(path);
            else
                logger.log("'" + path + "' is not a file.");
        });

        txtConsoleInput.addEventListener("keyup", this.keyupHandler.bind(this));
        txtConsoleInput.addEventListener("keydown", this.keydownHandler.bind(this));

        function kdHandler(e){
            if (!e.ctrlKey && !e.metaKey && !e.altKey
              && !e.shiftKey && apf.isCharacter(e.keyCode))
                txtConsoleInput.focus();
        }

        tabConsole.addEventListener("afterrender", function() {
            txtOutput.addEventListener("keydown", kdHandler);
            txtConsole.addEventListener("keydown", kdHandler);

            var activePage = settings.model.queryValue("auto/console/@active");
            if (activePage && !this.getPage(activePage))
                activePage = null;

            if (!activePage)
                activePage = this.getPages()[0].name;

            this.set(activePage);
        });

        tabConsole.addEventListener("afterswitch", function(e){
            settings.model.setQueryValue("auto/console/@active", e.nextPage.name);
            setTimeout(function(){
                txtConsoleInput.focus();
            });
        });

        this.splitter.addEventListener("dragdrop", function(e){
            settings.model.setQueryValue("auto/console/@height",
                _self.height = winDbgConsole.height)
        });

        this.nodes.push(winDbgConsole, this.splitter);

        this.keyEvents[KEY_UP] = function(input) {
            var newVal = _self.cliInputHistory.getPrev() || "";
            input.setValue(newVal);
        };
        this.keyEvents[KEY_DOWN] = function(input) {
            var newVal = _self.cliInputHistory.getNext() || "";
            input.setValue(newVal);
        };
        this.keyEvents[KEY_CR] = function(input) {
            var inputVal = input.getValue().trim();
            if (inputVal === "/?")
                return false;
            _self.evalInputCommand(inputVal);
            input.setValue("");
        };

        if (this.logged.length) {
            this.logged.forEach(function(text){
                txtConsole.addValue(text);
            });
        }

        commands.addCommand({
            name: "escapeconsole",
            bindKey: {mac: "Esc", win: "Esc"},
            isAvailable : function(){
                return apf.activeElement == txtConsoleInput;
            },
            exec: function () {
                _self.switchconsole();
            }
        });

        commands.addCommand({
            name: "abortclicommand",
            bindKey: {mac: "Ctrl-C", win: "Ctrl-C"},
            isAvailable : function(){
                // Determines if any input is selected, in which case we do
                // not want to cancel
                if (apf.activeElement === txtConsoleInput) {
                    var selection = window.getSelection();
                    var range = selection.getRangeAt(0);
                    if (range.endOffset - range.startOffset === 0)
                        return true;
                }
                return false;
            },
            exec: function () {
                _self.killProcess();
            }
        });

        // @TODO Defunct
        apf.setStyleClass(txtConsole.$ext, "feedback");
        apf.setStyleClass(txtOutput.$ext, "feedback");
    },

    /**
     * When the user clicks on the indicator next to the prompt output, it can
     * be in multiple states. If a process is running, this cancels the process.
     * If finished, this will either expand or collapse the output block
     */
    handleOutputBlockClick : function(e) {
        var pNode = e.target.parentNode;

        if (pNode.className.indexOf("loaded") !== -1) {
            if (pNode.className.indexOf("collapsed") !== -1)
                this.expandOutputBlock(pNode);
            else
                this.collapseOutputBlock(pNode);
        }
        else {
            this.killProcess(pNode);
        }
    },

    killProcess : function(pNode) {
        var command_id;
        // Simply get the ID of the last command sent to the server
        if (typeof pNode === "undefined")
            command_id = (this.command_id_tracer - 1)
        else
            command_id = parseInt(pNode.getAttribute("rel"), 10);

        var pid = this.tracerToPidMap[command_id];
        if (!pid)
            return;

        apf.setStyleClass(pNode, "quitting_proc");
        logger.logNodeStream("Quitting this process...", null,
            this.getLogStreamOutObject(command_id), ide);

        ide.send({
            command: "kill",
            pid: pid
        });
    },

    /**
     * @param DOMElement pNode The container block to be expanded
     * @param Event e The click event
     */
    expandOutputBlock : function(pNode, e) {
        if (typeof e !== "undefined" && e.target.className.indexOf("prompt_spinner") !== -1)
            return;

        var txt = apf.findHost(pNode);
        txt.$scrolldown = false;

        var height = parseInt(pNode.getAttribute("rel"), 10);
        apf.setStyleClass(pNode, null, ["collapsed"]);
        Firmin.animate(pNode, {
            height : height + "px"
        }, 0.2, function() {
            apf.layout.forceResize(tabConsole.$ext);
        });
    },

    /**
     * @param DOMElement pNode The container block to be collapsed
     */
    collapseOutputBlock : function(pNode) {
        // 20 = padding
        var startingHeight = apf.getHtmlInnerHeight(pNode) - 20;
        pNode.style.height = startingHeight + "px";
        pNode.setAttribute("rel", startingHeight);
        apf.setStyleClass(pNode, "collapsed");
        Firmin.animate(pNode, {
            height : "14px"
        }, 0.2, function() {
            apf.layout.forceResize(tabConsole.$ext);
            
            var txt = apf.findHost(pNode);
            var scroll = txt.$scrollArea;
            txt.$scrolldown = scroll.scrollTop >= scroll.scrollHeight
                - scroll.offsetHeight + apf.getVerBorders(scroll);
        });

        pNode.setAttribute("onclick", 'require("ext/console/console").expandOutputBlock(this, event)');
    },

    logged : [],
    log : function(text){
        if (this.inited)
            txtConsole.addValue(text);
        else
            this.logged.push(text);
    },

    maximizeConsoleHeight: function(){
        if (this.maximized)
            return;
        this.maximized = true;

        apf.document.documentElement.appendChild(winDbgConsole);
        winDbgConsole.setAttribute('anchors', '0 0 0 0');
        this.lastZIndex = winDbgConsole.$ext.style.zIndex;
        winDbgConsole.removeAttribute('height');
        winDbgConsole.$ext.style.maxHeight = "10000px";
        winDbgConsole.$ext.style.zIndex = 900000;

        settings.model.setQueryValue("auto/console/@maximized", true);
        btnConsoleMax.setValue(true);
    },

    restoreConsoleHeight : function(){
        if (!this.maximized)
            return;
        this.maximized = false;

        mainRow.appendChild(winDbgConsole);
        winDbgConsole.removeAttribute('anchors');
        this.maxHeight = window.innerHeight - 70;
        winDbgConsole.$ext.style.maxHeight =  this.maxHeight + "px";

        winDbgConsole.setAttribute('height', this.maxHeight && this.height > this.maxHeight ? this.maxHeight : this.height);
        winDbgConsole.$ext.style.zIndex = this.lastZIndex;

        settings.model.setQueryValue("auto/console/@maximized", false);
        btnConsoleMax.setValue(false);
    },

    showInput : function(temporary, immediate){
        var _self = this;
        
        if (!this.hiddenInput)
            return;

        ext.initExtension(this);

        this.$collapsedHeight = this.collapsedHeight;
        
        cliBox.show();
        
        if (!immediate) {
            cliBox.$ext.style.height = "0px";
            cliBox.$ext.scrollTop = 0;
            setTimeout(function(){
                cliBox.$ext.scrollTop = 0;
            });
    
            if (_self.hidden) {
                winDbgConsole.$ext.style.height = "0px";
                Firmin.animate(winDbgConsole.$ext, {
                    height: _self.collapsedHeight + "px",
                    timingFunction: "cubic-bezier(.30, .08, 0, 1)"
                }, 0.3);
            }
    
            var timer = setInterval(function(){apf.layout.forceResize()}, 10);
            Firmin.animate(cliBox.$ext, {
                height: _self.collapsedHeight + "px",
                timingFunction: "cubic-bezier(.30, .08, 0, 1)"
            }, 0.3, function(){
                if (_self.hidden)
                    winDbgConsole.setAttribute("height", _self.collapsedHeight + "px");
                
                winDbgConsole.$ext.style[apf.CSSPREFIX + "TransitionDuration"] = "";
                cliBox.$ext.style[apf.CSSPREFIX + "TransitionDuration"] = "";
                
                apf.layout.forceResize();
                clearInterval(timer);
            });
        }
        else {
            if (_self.hidden)
                winDbgConsole.setAttribute("height", _self.collapsedHeight + "px");
            apf.layout.forceResize();
        }
        
        if (temporary) {
            var _self = this;
            txtConsoleInput.addEventListener("blur", function(){
                if (_self.hiddenInput)
                    _self.hideInput(true);
                txtConsoleInput.removeEventListener("blur", arguments.callee);
            });
            txtConsoleInput.focus()
        }
        else {
            settings.model.setQueryValue("auto/console/@showinput", true);
            this.hiddenInput = false;
        }
    },

    hideInput : function(force, immediate){
        if (!force && (!this.inited || this.hiddenInput))
            return;

        this.$collapsedHeight = 0;
        
        if (!immediate) {
            if (this.hidden) {
                Firmin.animate(winDbgConsole.$ext, {
                    height: "0px",
                    timingFunction: "ease-in-out"
                }, 0.3);
            }
            
            var timer = setInterval(function(){apf.layout.forceResize()}, 10);
            Firmin.animate(cliBox.$ext, {
                height: "0px",
                timingFunction: "ease-in-out"
            }, 0.3, function(){
                cliBox.hide();
                apf.layout.forceResize();
                clearTimeout(timer);
            });
        }
        else {
            if (this.hidden)
                winDbgConsole.setAttribute("height", "0")
            cliBox.hide();
            apf.layout.forceResize();
        }

        settings.model.setQueryValue("auto/console/@showinput", false);
        this.hiddenInput = true;
    },

    show: function(immediate) { ext.initExtension(this); this._show(true, immediate); },
    hide: function(immediate) { this._show(false, immediate); },

    _show: function(shouldShow, immediate) {
        var _self = this;
        
        if (this.hidden != shouldShow)
            return;

        this.hidden = !shouldShow;

        if (this.animating)
            return;

        this.animating = true;

        var finish = function() {
            setTimeout(function(){
                if (!shouldShow) {
                    tabConsole.hide();
                }
                else {
                    winDbgConsole.$ext.style.minHeight = _self.minHeight + "px";
                    _self.maxHeight = window.innerHeight - 70;
                    winDbgConsole.$ext.style.maxHeight = this.maxHeight + "px";
                }

                winDbgConsole.height = height + 1;
                winDbgConsole.setAttribute("height", height);
                _self.splitter[shouldShow ? "show" : "hide"]();
                winDbgConsole.$ext.style[apf.CSSPREFIX + "TransitionDuration"] = "";

                _self.animating = false;

                settings.model.setQueryValue("auto/console/@expanded", shouldShow);

                apf.layout.forceResize();
            }, 100);
        };

        var height;
        var animOn = apf.isTrue(settings.model.queryValue("general/@animateui"));
        if (shouldShow) {
            height = Math.max(this.minHeight, Math.min(this.maxHeight, this.height));

            tabConsole.show();
            winDbgConsole.$ext.style.minHeight = 0;
            winDbgConsole.$ext.style.height = this.$collapsedHeight + "px";

            apf.setStyleClass(btnCollapseConsole.$ext, "btn_console_openOpen");

            if (!immediate && animOn) {
                Firmin.animate(winDbgConsole.$ext, {
                    height: height + "px",
                    timingFunction: "cubic-bezier(.30, .08, 0, 1)"
                }, 0.3, finish);
            }
            else
                finish();
        }
        else {
            height = this.$collapsedHeight;

            if (winDbgConsole.parentNode != mainRow)
                this.restoreConsoleHeight();

            apf.setStyleClass(btnCollapseConsole.$ext, "", ["btn_console_openOpen"]);
            winDbgConsole.$ext.style.minHeight = 0;
            winDbgConsole.$ext.style.maxHeight = "10000px";

            if (!immediate && animOn) {
                var timer = setInterval(function(){apf.layout.forceResize()}, 10);

                Firmin.animate(winDbgConsole.$ext, {
                    height: height + "px",
                    timingFunction: "ease-in-out"
                }, 0.3, function(){
                    clearInterval(timer);
                    finish();
                });
            }
            else
                finish();
        }
    },

    enable: function(){
        this.nodes.each(function(item) { item.enable(); });
    },

    disable: function(){
        this.nodes.each(function(item) { item.disable(); });
    },

    destroy: function(){
        commands.removeCommandsByName(
            ["help", "clear", "switchconsole", "toggleconsole",
             "escapeconsole", "toggleinputbar"]);

        this.nodes.each(function(item) { item.destroy(true, true); });
        this.nodes = [];
    }
});
});

