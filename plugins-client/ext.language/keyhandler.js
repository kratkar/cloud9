/**
 * Cloud9 Language Foundation
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {

var editors = require("ext/editors/editors");
var completionUtil = require("ext/codecomplete/complete_util");

function composeHandlers(mainHandler, fallbackHandler) {
    return function onKeyPress() {
        var result = mainHandler.apply(null, arguments);
        if(!result)
            fallbackHandler.apply(null, arguments);
    };
}

function typeAlongComplete(e) {
    if(e.metaKey || e.altKey || e.ctrlKey)
        return false;
    if(editors.currentEditor.amlEditor.syntax !== "javascript")
        return false;
    if(e.keyCode === 8) {
        var ext = require("ext/language/complete");
        var editor = editors.currentEditor.amlEditor.$editor;
        var pos = editor.getCursorPosition();
        var line = editor.session.getDocument().getLine(pos.row);
        if(!preceededByIdentifier(line, pos.column))
            return false;
        ext.deferredInvoke();
    }
    return false;
}

function typeAlongCompleteTextInput(text, pasted) {
    if(editors.currentEditor.amlEditor.syntax !== "javascript")
        return false;
    if(!pasted)
        handleChar(text);
}

function handleChar(ch) {
    if(ch.match(/[A-Za-z0-9_\$\.]/)) {
        var ext = require("ext/language/complete");
        var editor = editors.currentEditor.amlEditor.$editor;
        var pos = editor.getCursorPosition();
        var line = editor.session.getDocument().getLine(pos.row);
        ext.closeCompletionBox(null, true);
        if(!preceededByIdentifier(line, pos.column, ch))
            return false;
        ext.deferredInvoke();
    }
}

/**
 * Ensure that code completion is not triggered.
 */
function inCompletableCodeContext(line, column) {
    var inMode = null;
    if(line.match(/^\s*\*.+/))
        return false;
    for (var i = 0; i < column; i++) {
        if(line[i] === '"' && !inMode)
            inMode = '"';
        else if(line[i] === '"' && inMode === '"' && line[i-1] !== "\\")
            inMode = null;
        else if(line[i] === "'" && !inMode)
            inMode = "'";
        else if(line[i] === "'" && inMode === "'" && line[i-1] !== "\\")
            inMode = null;
        else if(line[i] === "/" && line[i+1] === "/") {
            inMode = '//';
            i++;
        }
        else if(line[i] === "/" && line[i+1] === "*" && !inMode) {
            inMode = '/*';
            i++;
        }
        else if(line[i] === "*" && line[i+1] === "/" && inMode === "/*") {
            inMode = null;
            i++;
        }
        else if(line[i] === "/" && !inMode)
            inMode = "/";
        else if(line[i] === "/" && inMode === "/" && line[i-1] !== "\\")
            inMode = null;
    }
    return !inMode;
}

function preceededByIdentifier(line, column, postfix) {
    var id = completionUtil.retrievePreceedingIdentifier(line, column);
    if(postfix) id += postfix;
    return id !== "" && !(id[0] >= '0' && id[0] <= '9') && inCompletableCodeContext(line, column);
}

exports.typeAlongCompleteTextInput = typeAlongCompleteTextInput;
exports.typeAlongComplete = typeAlongComplete;
exports.composeHandlers = composeHandlers;
exports.inCompletableCodeContext = inCompletableCodeContext;
exports.preceededByIdentifier = preceededByIdentifier;
});
