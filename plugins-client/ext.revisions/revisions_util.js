define(function(require, exports, module) {

var Range = require("ace/range").Range;
var Anchor = require("ace/anchor").Anchor;
var settings = require("ext/settings/settings");
var ide = require("core/ide");

var TIMELAPSE = 10 * 60 * 1000;
exports.compactRevisions = function(timestamps) {
    if (!timestamps.length) {
        return [];
    }
    else if (timestamps.length === 1) {
        return [timestamps];
    }

    return timestamps.reduce(function(prev, curr) {
        var p = [prev];
        var c = [curr];

        if (prev.length) {
            var last = prev[prev.length - 1];
            if (curr < (last[0] + TIMELAPSE)) {
                last.push(curr);
            }
            else {
                prev.push(c);
            }
            return prev;
        }
        else {
            if (curr < (prev + TIMELAPSE)) {
                p.push(curr);
                return [[prev, curr]];
            }
            else {
                return [p, c];
            }
        }
    });
};

// Faster implementation of `Array.reduce` than the native ones in webkit,
// chrome 18 and Firefox 12
Array.prototype.__reduce = function(func, initial) {
    var value, idx;
    if (initial !== null) {
        value = initial;
        idx = 0;
    }
    else if (this) {
        value = this[0];
        idx = 1;
    }
    else {
        return null;
    }

    var len = this.length;
    for (; idx < len; idx++) { value = func(value, this[idx]); }

    return value;
};

/**
 * addCodeMarker(editor, type, range)
 * - session(Object): Editor session where we should put the markers
 * - doc(Object): Document object where to anchor the markers, passed as
 *   a parameter for convenience in case the function is called in a loop.
 * - type(String): type of the marker. It can be 'add' or 'remove'
 * - range(Object): range of text covered by the marker
 *
 * Adds a code marker to the given document, and puts it in a particular range
 * in the source. The type determines its appearance, since different classes
 * are defined in the CSS.
 **/
exports.addCodeMarker = function(session, doc, type, range) {
    if (!session.revAnchors) {
        session.revAnchors = [];
    }

    var markerId;
    // var markerStrike
    var anchor = new Anchor(doc, range.fromRow, range.fromCol);
    session.revAnchors.push(anchor);

    var colDiff = range.toCol - range.fromCol;
    var rowDiff = range.toRow - range.fromRow;
    var updateFloat = function() {
        if (markerId) {
            session.removeMarker(markerId);
        }

        var startPoints = anchor.getPosition();
        var endPoints = {
            row: anchor.row + rowDiff,
            column: anchor.column + colDiff
        };

        var range = Range.fromPoints(startPoints, endPoints);
        if (range.isEmpty())
            return;

        markerId = session.addMarker(range, "revision_hl_" + type, "background");
        /*
         * Uncomment the following to get strikethrough on deleted text.
         *
         * if (markerStrike) {
         *     session.removeMarker(markerStrike);
         * }
         *
         * if (type === "delete") {
         *     if (!range.isMultiLine()) {
         *         endPoints.row += 1;
         *         endPoints.column = 0;
         *         range = Range.fromPoints(startPoints, endPoints);
         *     }

         *     markerStrike = session.addMarker(range, "revision_hl_delete_strike", "text");
         * }
        **/
    };

    updateFloat();
    anchor.on("change", updateFloat);
};

exports.isAutoSaveEnabled = function() {
    return apf.isTrue(settings.model.queryValue("general/@autosaveenabled"));
};

exports.pageHasChanged = function(page) {
    if (!page) {
        throw new Error("Page object parameter missing");
    }
    var model = page.getModel();
    return model && model.queryValue("@changed") == 1;
};

exports.pageIsCode = function(page) {
    if (!page) {
        throw new Error("Page object parameter missing");
    }
    return page.type === "ext/code/code";
};

exports.stripWSFromPath = function(path) {
    var docPath = path.replace(ide.davPrefix, "");
    docPath = docPath.charAt(0) === "/" ? docPath.substr(1) : docPath;
    return docPath;
};

exports.getDocPath = function(page) {
    if (!page && tabEditors) {
        page = tabEditors.getPage();
    }

    // Can we rely on `name`?
    // What follows is a hacky way to get a path that we can use on
    // the server. I am sure that these workspace string manipulation
    // functions are somewhere...to be fixed.
    return exports.stripWSFromPath(page.name);
};

exports.localDate = function(ts) {
    var getTZOffset = function() {
        return -(new Date()).getTimezoneOffset() * 60000;
    };

    return new Date(ts + getTZOffset());
};

exports.question = function(title, header, msg, onyes, onyesall, onno, onnoall) {
    winQuestionRev.show();
    winQuestionRev.setAttribute("title", title);
    winQuestionRevHeader.$ext.innerHTML = header;
    winQuestionRevMsg.$ext.innerHTML = msg;
    btnQuestionRevYes.onclick = onyes;
    btnQuestionRevNo.onclick = onno;
    btnQuestionRevYesAll.onclick = onyesall;
    btnQuestionRevNoAll.onclick = onnoall;
};

});
