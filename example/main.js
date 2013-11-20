;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Qstart = require('qstart'),
    Q = require('q'),
    Mask = require('../lib/mask');

function main() {
    Mask.init();
    var btn = window.document.getElementById("btn1"),
        log = function (s) { return function () { console.log(s); } },
        err = function (s) { return function (err) { console.log(s + " " + err, err.stack); } };

    btn.addEventListener(window.document.ontouchstart === null ? "touchstart": "click", function (evt) {
        Mask.show().then(log("Mask displayed"), err("Oops show,"));
    });

    function touchAction(evt) {
        Mask.hide().then(log("Mask hidden"), err("Oops hide,"));
    }

    Mask.onTouch(touchAction);
}

Qstart.then(main);

},{"../lib/mask":5,"q":3,"qstart":4}],2:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],3:[function(require,module,exports){
var process=require("__browserify_process");// vim:ts=4:sts=4:sw=4:
/*!
 *
 * Copyright 2009-2012 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 *
 * With parts by Tyler Close
 * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
 * at http://www.opensource.org/licenses/mit-license.html
 * Forked at ref_send.js version: 2009-05-11
 *
 * With parts by Mark Miller
 * Copyright (C) 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

(function (definition) {
    // Turn off strict mode for this function so we can assign to global.Q
    /* jshint strict: false */

    // This file will function properly as a <script> tag, or a module
    // using CommonJS and NodeJS or RequireJS module formats.  In
    // Common/Node/RequireJS, the module exports the Q API and when
    // executed as a simple <script>, it creates a Q global instead.

    // Montage Require
    if (typeof bootstrap === "function") {
        bootstrap("promise", definition);

    // CommonJS
    } else if (typeof exports === "object") {
        module.exports = definition();

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
        define(definition);

    // SES (Secure EcmaScript)
    } else if (typeof ses !== "undefined") {
        if (!ses.ok()) {
            return;
        } else {
            ses.makeQ = definition;
        }

    // <script>
    } else {
        Q = definition();
    }

})(function () {
"use strict";

var hasStacks = false;
try {
    throw new Error();
} catch (e) {
    hasStacks = !!e.stack;
}

// All code after this point will be filtered from stack traces reported
// by Q.
var qStartingLine = captureLine();
var qFileName;

// shims

// used for fallback in "allResolved"
var noop = function () {};

// Use the fastest possible means to execute a task in a future turn
// of the event loop.
var nextTick =(function () {
    // linked list of tasks (single, with head node)
    var head = {task: void 0, next: null};
    var tail = head;
    var flushing = false;
    var requestTick = void 0;
    var isNodeJS = false;

    function flush() {
        /* jshint loopfunc: true */

        while (head.next) {
            head = head.next;
            var task = head.task;
            head.task = void 0;
            var domain = head.domain;

            if (domain) {
                head.domain = void 0;
                domain.enter();
            }

            try {
                task();

            } catch (e) {
                if (isNodeJS) {
                    // In node, uncaught exceptions are considered fatal errors.
                    // Re-throw them synchronously to interrupt flushing!

                    // Ensure continuation if the uncaught exception is suppressed
                    // listening "uncaughtException" events (as domains does).
                    // Continue in next event to avoid tick recursion.
                    if (domain) {
                        domain.exit();
                    }
                    setTimeout(flush, 0);
                    if (domain) {
                        domain.enter();
                    }

                    throw e;

                } else {
                    // In browsers, uncaught exceptions are not fatal.
                    // Re-throw them asynchronously to avoid slow-downs.
                    setTimeout(function() {
                       throw e;
                    }, 0);
                }
            }

            if (domain) {
                domain.exit();
            }
        }

        flushing = false;
    }

    nextTick = function (task) {
        tail = tail.next = {
            task: task,
            domain: isNodeJS && process.domain,
            next: null
        };

        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };

    if (typeof process !== "undefined" && process.nextTick) {
        // Node.js before 0.9. Note that some fake-Node environments, like the
        // Mocha test runner, introduce a `process` global without a `nextTick`.
        isNodeJS = true;

        requestTick = function () {
            process.nextTick(flush);
        };

    } else if (typeof setImmediate === "function") {
        // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
        if (typeof window !== "undefined") {
            requestTick = setImmediate.bind(window, flush);
        } else {
            requestTick = function () {
                setImmediate(flush);
            };
        }

    } else if (typeof MessageChannel !== "undefined") {
        // modern browsers
        // http://www.nonblocking.io/2011/06/windownexttick.html
        var channel = new MessageChannel();
        // At least Safari Version 6.0.5 (8536.30.1) intermittently cannot create
        // working message ports the first time a page loads.
        channel.port1.onmessage = function () {
            requestTick = requestPortTick;
            channel.port1.onmessage = flush;
            flush();
        };
        var requestPortTick = function () {
            // Opera requires us to provide a message payload, regardless of
            // whether we use it.
            channel.port2.postMessage(0);
        };
        requestTick = function () {
            setTimeout(flush, 0);
            requestPortTick();
        };

    } else {
        // old browsers
        requestTick = function () {
            setTimeout(flush, 0);
        };
    }

    return nextTick;
})();

// Attempt to make generics safe in the face of downstream
// modifications.
// There is no situation where this is necessary.
// If you need a security guarantee, these primordials need to be
// deeply frozen anyway, and if you don’t need a security guarantee,
// this is just plain paranoid.
// However, this does have the nice side-effect of reducing the size
// of the code by reducing x.call() to merely x(), eliminating many
// hard-to-minify characters.
// See Mark Miller’s explanation of what this does.
// http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
var call = Function.call;
function uncurryThis(f) {
    return function () {
        return call.apply(f, arguments);
    };
}
// This is equivalent, but slower:
// uncurryThis = Function_bind.bind(Function_bind.call);
// http://jsperf.com/uncurrythis

var array_slice = uncurryThis(Array.prototype.slice);

var array_reduce = uncurryThis(
    Array.prototype.reduce || function (callback, basis) {
        var index = 0,
            length = this.length;
        // concerning the initial value, if one is not provided
        if (arguments.length === 1) {
            // seek to the first value in the array, accounting
            // for the possibility that is is a sparse array
            do {
                if (index in this) {
                    basis = this[index++];
                    break;
                }
                if (++index >= length) {
                    throw new TypeError();
                }
            } while (1);
        }
        // reduce
        for (; index < length; index++) {
            // account for the possibility that the array is sparse
            if (index in this) {
                basis = callback(basis, this[index], index);
            }
        }
        return basis;
    }
);

var array_indexOf = uncurryThis(
    Array.prototype.indexOf || function (value) {
        // not a very good shim, but good enough for our one use of it
        for (var i = 0; i < this.length; i++) {
            if (this[i] === value) {
                return i;
            }
        }
        return -1;
    }
);

var array_map = uncurryThis(
    Array.prototype.map || function (callback, thisp) {
        var self = this;
        var collect = [];
        array_reduce(self, function (undefined, value, index) {
            collect.push(callback.call(thisp, value, index, self));
        }, void 0);
        return collect;
    }
);

var object_create = Object.create || function (prototype) {
    function Type() { }
    Type.prototype = prototype;
    return new Type();
};

var object_hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

var object_keys = Object.keys || function (object) {
    var keys = [];
    for (var key in object) {
        if (object_hasOwnProperty(object, key)) {
            keys.push(key);
        }
    }
    return keys;
};

var object_toString = uncurryThis(Object.prototype.toString);

function isObject(value) {
    return value === Object(value);
}

// generator related shims

// FIXME: Remove this function once ES6 generators are in SpiderMonkey.
function isStopIteration(exception) {
    return (
        object_toString(exception) === "[object StopIteration]" ||
        exception instanceof QReturnValue
    );
}

// FIXME: Remove this helper and Q.return once ES6 generators are in
// SpiderMonkey.
var QReturnValue;
if (typeof ReturnValue !== "undefined") {
    QReturnValue = ReturnValue;
} else {
    QReturnValue = function (value) {
        this.value = value;
    };
}

// Until V8 3.19 / Chromium 29 is released, SpiderMonkey is the only
// engine that has a deployed base of browsers that support generators.
// However, SM's generators use the Python-inspired semantics of
// outdated ES6 drafts.  We would like to support ES6, but we'd also
// like to make it possible to use generators in deployed browsers, so
// we also support Python-style generators.  At some point we can remove
// this block.
var hasES6Generators;
try {
    /* jshint evil: true, nonew: false */
    new Function("(function* (){ yield 1; })");
    hasES6Generators = true;
} catch (e) {
    hasES6Generators = false;
}

// long stack traces

var STACK_JUMP_SEPARATOR = "From previous event:";

function makeStackTraceLong(error, promise) {
    // If possible, transform the error stack trace by removing Node and Q
    // cruft, then concatenating with the stack trace of `promise`. See #57.
    if (hasStacks &&
        promise.stack &&
        typeof error === "object" &&
        error !== null &&
        error.stack &&
        error.stack.indexOf(STACK_JUMP_SEPARATOR) === -1
    ) {
        var stacks = [];
        for (var p = promise; !!p; p = p.source) {
            if (p.stack) {
                stacks.unshift(p.stack);
            }
        }
        stacks.unshift(error.stack);

        var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
        error.stack = filterStackString(concatedStacks);
    }
}

function filterStackString(stackString) {
    var lines = stackString.split("\n");
    var desiredLines = [];
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];

        if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
            desiredLines.push(line);
        }
    }
    return desiredLines.join("\n");
}

function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 ||
           stackLine.indexOf("(node.js:") !== -1;
}

function getFileNameAndLineNumber(stackLine) {
    // Named functions: "at functionName (filename:lineNumber:columnNumber)"
    // In IE10 function name can have spaces ("Anonymous function") O_o
    var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
    if (attempt1) {
        return [attempt1[1], Number(attempt1[2])];
    }

    // Anonymous functions: "at filename:lineNumber:columnNumber"
    var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
    if (attempt2) {
        return [attempt2[1], Number(attempt2[2])];
    }

    // Firefox style: "function@filename:lineNumber or @filename:lineNumber"
    var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
    if (attempt3) {
        return [attempt3[1], Number(attempt3[2])];
    }
}

function isInternalFrame(stackLine) {
    var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);

    if (!fileNameAndLineNumber) {
        return false;
    }

    var fileName = fileNameAndLineNumber[0];
    var lineNumber = fileNameAndLineNumber[1];

    return fileName === qFileName &&
        lineNumber >= qStartingLine &&
        lineNumber <= qEndingLine;
}

// discover own file name and line number range for filtering stack
// traces
function captureLine() {
    if (!hasStacks) {
        return;
    }

    try {
        throw new Error();
    } catch (e) {
        var lines = e.stack.split("\n");
        var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
        var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
        if (!fileNameAndLineNumber) {
            return;
        }

        qFileName = fileNameAndLineNumber[0];
        return fileNameAndLineNumber[1];
    }
}

function deprecate(callback, name, alternative) {
    return function () {
        if (typeof console !== "undefined" &&
            typeof console.warn === "function") {
            console.warn(name + " is deprecated, use " + alternative +
                         " instead.", new Error("").stack);
        }
        return callback.apply(callback, arguments);
    };
}

// end of shims
// beginning of real work

/**
 * Constructs a promise for an immediate reference, passes promises through, or
 * coerces promises from different systems.
 * @param value immediate reference or promise
 */
function Q(value) {
    // If the object is already a Promise, return it directly.  This enables
    // the resolve function to both be used to created references from objects,
    // but to tolerably coerce non-promises to promises.
    if (isPromise(value)) {
        return value;
    }

    // assimilate thenables
    if (isPromiseAlike(value)) {
        return coerce(value);
    } else {
        return fulfill(value);
    }
}
Q.resolve = Q;

/**
 * Performs a task in a future turn of the event loop.
 * @param {Function} task
 */
Q.nextTick = nextTick;

/**
 * Controls whether or not long stack traces will be on
 */
Q.longStackSupport = false;

/**
 * Constructs a {promise, resolve, reject} object.
 *
 * `resolve` is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke `resolve` with any value that is
 * not a thenable. To reject the promise, invoke `resolve` with a rejected
 * thenable, or invoke `reject` with the reason directly. To resolve the
 * promise to another thenable, thus putting it in the same state, invoke
 * `resolve` with that other thenable.
 */
Q.defer = defer;
function defer() {
    // if "messages" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the messages array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the `resolve` function because it handles both fully
    // non-thenable values and other thenables gracefully.
    var messages = [], progressListeners = [], resolvedPromise;

    var deferred = object_create(defer.prototype);
    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, operands) {
        var args = array_slice(arguments);
        if (messages) {
            messages.push(args);
            if (op === "when" && operands[1]) { // progress operand
                progressListeners.push(operands[1]);
            }
        } else {
            nextTick(function () {
                resolvedPromise.promiseDispatch.apply(resolvedPromise, args);
            });
        }
    };

    // XXX deprecated
    promise.valueOf = deprecate(function () {
        if (messages) {
            return promise;
        }
        var nearerValue = nearer(resolvedPromise);
        if (isPromise(nearerValue)) {
            resolvedPromise = nearerValue; // shorten chain
        }
        return nearerValue;
    }, "valueOf", "inspect");

    promise.inspect = function () {
        if (!resolvedPromise) {
            return { state: "pending" };
        }
        return resolvedPromise.inspect();
    };

    if (Q.longStackSupport && hasStacks) {
        try {
            throw new Error();
        } catch (e) {
            // NOTE: don't try to use `Error.captureStackTrace` or transfer the
            // accessor around; that causes memory leaks as per GH-111. Just
            // reify the stack trace as a string ASAP.
            //
            // At the same time, cut off the first line; it's always just
            // "[object Promise]\n", as per the `toString`.
            promise.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
        }
    }

    // NOTE: we do the checks for `resolvedPromise` in each method, instead of
    // consolidating them into `become`, since otherwise we'd create new
    // promises with the lines `become(whatever(value))`. See e.g. GH-252.

    function become(newPromise) {
        resolvedPromise = newPromise;
        promise.source = newPromise;

        array_reduce(messages, function (undefined, message) {
            nextTick(function () {
                newPromise.promiseDispatch.apply(newPromise, message);
            });
        }, void 0);

        messages = void 0;
        progressListeners = void 0;
    }

    deferred.promise = promise;
    deferred.resolve = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(Q(value));
    };

    deferred.fulfill = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(fulfill(value));
    };
    deferred.reject = function (reason) {
        if (resolvedPromise) {
            return;
        }

        become(reject(reason));
    };
    deferred.notify = function (progress) {
        if (resolvedPromise) {
            return;
        }

        array_reduce(progressListeners, function (undefined, progressListener) {
            nextTick(function () {
                progressListener(progress);
            });
        }, void 0);
    };

    return deferred;
}

/**
 * Creates a Node-style callback that will resolve or reject the deferred
 * promise.
 * @returns a nodeback
 */
defer.prototype.makeNodeResolver = function () {
    var self = this;
    return function (error, value) {
        if (error) {
            self.reject(error);
        } else if (arguments.length > 2) {
            self.resolve(array_slice(arguments, 1));
        } else {
            self.resolve(value);
        }
    };
};

/**
 * @param resolver {Function} a function that returns nothing and accepts
 * the resolve, reject, and notify functions for a deferred.
 * @returns a promise that may be resolved with the given resolve and reject
 * functions, or rejected by a thrown exception in resolver
 */
Q.promise = promise;
function promise(resolver) {
    if (typeof resolver !== "function") {
        throw new TypeError("resolver must be a function.");
    }
    var deferred = defer();
    try {
        resolver(deferred.resolve, deferred.reject, deferred.notify);
    } catch (reason) {
        deferred.reject(reason);
    }
    return deferred.promise;
}

// XXX experimental.  This method is a way to denote that a local value is
// serializable and should be immediately dispatched to a remote upon request,
// instead of passing a reference.
Q.passByCopy = function (object) {
    //freeze(object);
    //passByCopies.set(object, true);
    return object;
};

Promise.prototype.passByCopy = function () {
    //freeze(object);
    //passByCopies.set(object, true);
    return this;
};

/**
 * If two promises eventually fulfill to the same value, promises that value,
 * but otherwise rejects.
 * @param x {Any*}
 * @param y {Any*}
 * @returns {Any*} a promise for x and y if they are the same, but a rejection
 * otherwise.
 *
 */
Q.join = function (x, y) {
    return Q(x).join(y);
};

Promise.prototype.join = function (that) {
    return Q([this, that]).spread(function (x, y) {
        if (x === y) {
            // TODO: "===" should be Object.is or equiv
            return x;
        } else {
            throw new Error("Can't join: not the same: " + x + " " + y);
        }
    });
};

/**
 * Returns a promise for the first of an array of promises to become fulfilled.
 * @param answers {Array[Any*]} promises to race
 * @returns {Any*} the first promise to be fulfilled
 */
Q.race = race;
function race(answerPs) {
    return promise(function(resolve, reject) {
        // Switch to this once we can assume at least ES5
        // answerPs.forEach(function(answerP) {
        //     Q(answerP).then(resolve, reject);
        // });
        // Use this in the meantime
        for (var i = 0, len = answerPs.length; i < len; i++) {
            Q(answerPs[i]).then(resolve, reject);
        }
    });
}

Promise.prototype.race = function () {
    return this.then(Q.race);
};

/**
 * Constructs a Promise with a promise descriptor object and optional fallback
 * function.  The descriptor contains methods like when(rejected), get(name),
 * set(name, value), post(name, args), and delete(name), which all
 * return either a value, a promise for a value, or a rejection.  The fallback
 * accepts the operation name, a resolver, and any further arguments that would
 * have been forwarded to the appropriate method above had a method been
 * provided with the proper name.  The API makes no guarantees about the nature
 * of the returned object, apart from that it is usable whereever promises are
 * bought and sold.
 */
Q.makePromise = Promise;
function Promise(descriptor, fallback, inspect) {
    if (fallback === void 0) {
        fallback = function (op) {
            return reject(new Error(
                "Promise does not support operation: " + op
            ));
        };
    }
    if (inspect === void 0) {
        inspect = function () {
            return {state: "unknown"};
        };
    }

    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, args) {
        var result;
        try {
            if (descriptor[op]) {
                result = descriptor[op].apply(promise, args);
            } else {
                result = fallback.call(promise, op, args);
            }
        } catch (exception) {
            result = reject(exception);
        }
        if (resolve) {
            resolve(result);
        }
    };

    promise.inspect = inspect;

    // XXX deprecated `valueOf` and `exception` support
    if (inspect) {
        var inspected = inspect();
        if (inspected.state === "rejected") {
            promise.exception = inspected.reason;
        }

        promise.valueOf = deprecate(function () {
            var inspected = inspect();
            if (inspected.state === "pending" ||
                inspected.state === "rejected") {
                return promise;
            }
            return inspected.value;
        });
    }

    return promise;
}

Promise.prototype.toString = function () {
    return "[object Promise]";
};

Promise.prototype.then = function (fulfilled, rejected, progressed) {
    var self = this;
    var deferred = defer();
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks

    function _fulfilled(value) {
        try {
            return typeof fulfilled === "function" ? fulfilled(value) : value;
        } catch (exception) {
            return reject(exception);
        }
    }

    function _rejected(exception) {
        if (typeof rejected === "function") {
            makeStackTraceLong(exception, self);
            try {
                return rejected(exception);
            } catch (newException) {
                return reject(newException);
            }
        }
        return reject(exception);
    }

    function _progressed(value) {
        return typeof progressed === "function" ? progressed(value) : value;
    }

    nextTick(function () {
        self.promiseDispatch(function (value) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_fulfilled(value));
        }, "when", [function (exception) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_rejected(exception));
        }]);
    });

    // Progress propagator need to be attached in the current tick.
    self.promiseDispatch(void 0, "when", [void 0, function (value) {
        var newValue;
        var threw = false;
        try {
            newValue = _progressed(value);
        } catch (e) {
            threw = true;
            if (Q.onerror) {
                Q.onerror(e);
            } else {
                throw e;
            }
        }

        if (!threw) {
            deferred.notify(newValue);
        }
    }]);

    return deferred.promise;
};

/**
 * Registers an observer on a promise.
 *
 * Guarantees:
 *
 * 1. that fulfilled and rejected will be called only once.
 * 2. that either the fulfilled callback or the rejected callback will be
 *    called, but not both.
 * 3. that fulfilled and rejected will not be called in this turn.
 *
 * @param value      promise or immediate reference to observe
 * @param fulfilled  function to be called with the fulfilled value
 * @param rejected   function to be called with the rejection exception
 * @param progressed function to be called on any progress notifications
 * @return promise for the return value from the invoked callback
 */
Q.when = when;
function when(value, fulfilled, rejected, progressed) {
    return Q(value).then(fulfilled, rejected, progressed);
}

Promise.prototype.thenResolve = function (value) {
    return this.then(function () { return value; });
};

Q.thenResolve = function (promise, value) {
    return Q(promise).thenResolve(value);
};

Promise.prototype.thenReject = function (reason) {
    return this.then(function () { throw reason; });
};

Q.thenReject = function (promise, reason) {
    return Q(promise).thenReject(reason);
};

/**
 * If an object is not a promise, it is as "near" as possible.
 * If a promise is rejected, it is as "near" as possible too.
 * If it’s a fulfilled promise, the fulfillment value is nearer.
 * If it’s a deferred promise and the deferred has been resolved, the
 * resolution is "nearer".
 * @param object
 * @returns most resolved (nearest) form of the object
 */

// XXX should we re-do this?
Q.nearer = nearer;
function nearer(value) {
    if (isPromise(value)) {
        var inspected = value.inspect();
        if (inspected.state === "fulfilled") {
            return inspected.value;
        }
    }
    return value;
}

/**
 * @returns whether the given object is a promise.
 * Otherwise it is a fulfilled value.
 */
Q.isPromise = isPromise;
function isPromise(object) {
    return isObject(object) &&
        typeof object.promiseDispatch === "function" &&
        typeof object.inspect === "function";
}

Q.isPromiseAlike = isPromiseAlike;
function isPromiseAlike(object) {
    return isObject(object) && typeof object.then === "function";
}

/**
 * @returns whether the given object is a pending promise, meaning not
 * fulfilled or rejected.
 */
Q.isPending = isPending;
function isPending(object) {
    return isPromise(object) && object.inspect().state === "pending";
}

Promise.prototype.isPending = function () {
    return this.inspect().state === "pending";
};

/**
 * @returns whether the given object is a value or fulfilled
 * promise.
 */
Q.isFulfilled = isFulfilled;
function isFulfilled(object) {
    return !isPromise(object) || object.inspect().state === "fulfilled";
}

Promise.prototype.isFulfilled = function () {
    return this.inspect().state === "fulfilled";
};

/**
 * @returns whether the given object is a rejected promise.
 */
Q.isRejected = isRejected;
function isRejected(object) {
    return isPromise(object) && object.inspect().state === "rejected";
}

Promise.prototype.isRejected = function () {
    return this.inspect().state === "rejected";
};

//// BEGIN UNHANDLED REJECTION TRACKING

// This promise library consumes exceptions thrown in handlers so they can be
// handled by a subsequent promise.  The exceptions get added to this array when
// they are created, and removed when they are handled.  Note that in ES6 or
// shimmed environments, this would naturally be a `Set`.
var unhandledReasons = [];
var unhandledRejections = [];
var unhandledReasonsDisplayed = false;
var trackUnhandledRejections = true;
function displayUnhandledReasons() {
    if (
        !unhandledReasonsDisplayed &&
        typeof window !== "undefined" &&
        !window.Touch &&
        window.console
    ) {
        console.warn("[Q] Unhandled rejection reasons (should be empty):",
                     unhandledReasons);
    }

    unhandledReasonsDisplayed = true;
}

function logUnhandledReasons() {
    for (var i = 0; i < unhandledReasons.length; i++) {
        var reason = unhandledReasons[i];
        console.warn("Unhandled rejection reason:", reason);
    }
}

function resetUnhandledRejections() {
    unhandledReasons.length = 0;
    unhandledRejections.length = 0;
    unhandledReasonsDisplayed = false;

    if (!trackUnhandledRejections) {
        trackUnhandledRejections = true;

        // Show unhandled rejection reasons if Node exits without handling an
        // outstanding rejection.  (Note that Browserify presently produces a
        // `process` global without the `EventEmitter` `on` method.)
        if (typeof process !== "undefined" && process.on) {
            process.on("exit", logUnhandledReasons);
        }
    }
}

function trackRejection(promise, reason) {
    if (!trackUnhandledRejections) {
        return;
    }

    unhandledRejections.push(promise);
    if (reason && typeof reason.stack !== "undefined") {
        unhandledReasons.push(reason.stack);
    } else {
        unhandledReasons.push("(no stack) " + reason);
    }
    displayUnhandledReasons();
}

function untrackRejection(promise) {
    if (!trackUnhandledRejections) {
        return;
    }

    var at = array_indexOf(unhandledRejections, promise);
    if (at !== -1) {
        unhandledRejections.splice(at, 1);
        unhandledReasons.splice(at, 1);
    }
}

Q.resetUnhandledRejections = resetUnhandledRejections;

Q.getUnhandledReasons = function () {
    // Make a copy so that consumers can't interfere with our internal state.
    return unhandledReasons.slice();
};

Q.stopUnhandledRejectionTracking = function () {
    resetUnhandledRejections();
    if (typeof process !== "undefined" && process.on) {
        process.removeListener("exit", logUnhandledReasons);
    }
    trackUnhandledRejections = false;
};

resetUnhandledRejections();

//// END UNHANDLED REJECTION TRACKING

/**
 * Constructs a rejected promise.
 * @param reason value describing the failure
 */
Q.reject = reject;
function reject(reason) {
    var rejection = Promise({
        "when": function (rejected) {
            // note that the error has been handled
            if (rejected) {
                untrackRejection(this);
            }
            return rejected ? rejected(reason) : this;
        }
    }, function fallback() {
        return this;
    }, function inspect() {
        return { state: "rejected", reason: reason };
    });

    // Note that the reason has not been handled.
    trackRejection(rejection, reason);

    return rejection;
}

/**
 * Constructs a fulfilled promise for an immediate reference.
 * @param value immediate reference
 */
Q.fulfill = fulfill;
function fulfill(value) {
    return Promise({
        "when": function () {
            return value;
        },
        "get": function (name) {
            return value[name];
        },
        "set": function (name, rhs) {
            value[name] = rhs;
        },
        "delete": function (name) {
            delete value[name];
        },
        "post": function (name, args) {
            // Mark Miller proposes that post with no name should apply a
            // promised function.
            if (name === null || name === void 0) {
                return value.apply(void 0, args);
            } else {
                return value[name].apply(value, args);
            }
        },
        "apply": function (thisp, args) {
            return value.apply(thisp, args);
        },
        "keys": function () {
            return object_keys(value);
        }
    }, void 0, function inspect() {
        return { state: "fulfilled", value: value };
    });
}

/**
 * Converts thenables to Q promises.
 * @param promise thenable promise
 * @returns a Q promise
 */
function coerce(promise) {
    var deferred = defer();
    nextTick(function () {
        try {
            promise.then(deferred.resolve, deferred.reject, deferred.notify);
        } catch (exception) {
            deferred.reject(exception);
        }
    });
    return deferred.promise;
}

/**
 * Annotates an object such that it will never be
 * transferred away from this process over any promise
 * communication channel.
 * @param object
 * @returns promise a wrapping of that object that
 * additionally responds to the "isDef" message
 * without a rejection.
 */
Q.master = master;
function master(object) {
    return Promise({
        "isDef": function () {}
    }, function fallback(op, args) {
        return dispatch(object, op, args);
    }, function () {
        return Q(object).inspect();
    });
}

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param fulfilled callback that receives variadic arguments from the
 * promised array
 * @param rejected callback that receives the exception if the promise
 * is rejected.
 * @returns a promise for the return value or thrown exception of
 * either callback.
 */
Q.spread = spread;
function spread(value, fulfilled, rejected) {
    return Q(value).spread(fulfilled, rejected);
}

Promise.prototype.spread = function (fulfilled, rejected) {
    return this.all().then(function (array) {
        return fulfilled.apply(void 0, array);
    }, rejected);
};

/**
 * The async function is a decorator for generator functions, turning
 * them into asynchronous generators.  Although generators are only part
 * of the newest ECMAScript 6 drafts, this code does not cause syntax
 * errors in older engines.  This code should continue to work and will
 * in fact improve over time as the language improves.
 *
 * ES6 generators are currently part of V8 version 3.19 with the
 * --harmony-generators runtime flag enabled.  SpiderMonkey has had them
 * for longer, but under an older Python-inspired form.  This function
 * works on both kinds of generators.
 *
 * Decorates a generator function such that:
 *  - it may yield promises
 *  - execution will continue when that promise is fulfilled
 *  - the value of the yield expression will be the fulfilled value
 *  - it returns a promise for the return value (when the generator
 *    stops iterating)
 *  - the decorated function returns a promise for the return value
 *    of the generator or the first rejected promise among those
 *    yielded.
 *  - if an error is thrown in the generator, it propagates through
 *    every following yield until it is caught, or until it escapes
 *    the generator function altogether, and is translated into a
 *    rejection for the promise returned by the decorated generator.
 */
Q.async = async;
function async(makeGenerator) {
    return function () {
        // when verb is "send", arg is a value
        // when verb is "throw", arg is an exception
        function continuer(verb, arg) {
            var result;
            if (hasES6Generators) {
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    return reject(exception);
                }
                if (result.done) {
                    return result.value;
                } else {
                    return when(result.value, callback, errback);
                }
            } else {
                // FIXME: Remove this case when SM does ES6 generators.
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    if (isStopIteration(exception)) {
                        return exception.value;
                    } else {
                        return reject(exception);
                    }
                }
                return when(result, callback, errback);
            }
        }
        var generator = makeGenerator.apply(this, arguments);
        var callback = continuer.bind(continuer, "next");
        var errback = continuer.bind(continuer, "throw");
        return callback();
    };
}

/**
 * The spawn function is a small wrapper around async that immediately
 * calls the generator and also ends the promise chain, so that any
 * unhandled errors are thrown instead of forwarded to the error
 * handler. This is useful because it's extremely common to run
 * generators at the top-level to work with libraries.
 */
Q.spawn = spawn;
function spawn(makeGenerator) {
    Q.done(Q.async(makeGenerator)());
}

// FIXME: Remove this interface once ES6 generators are in SpiderMonkey.
/**
 * Throws a ReturnValue exception to stop an asynchronous generator.
 *
 * This interface is a stop-gap measure to support generator return
 * values in older Firefox/SpiderMonkey.  In browsers that support ES6
 * generators like Chromium 29, just use "return" in your generator
 * functions.
 *
 * @param value the return value for the surrounding generator
 * @throws ReturnValue exception with the value.
 * @example
 * // ES6 style
 * Q.async(function* () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      return foo + bar;
 * })
 * // Older SpiderMonkey style
 * Q.async(function () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      Q.return(foo + bar);
 * })
 */
Q["return"] = _return;
function _return(value) {
    throw new QReturnValue(value);
}

/**
 * The promised function decorator ensures that any promise arguments
 * are settled and passed as values (`this` is also settled and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Q.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Q(a), Q(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
Q.promised = promised;
function promised(callback) {
    return function () {
        return spread([this, all(arguments)], function (self, args) {
            return callback.apply(self, args);
        });
    };
}

/**
 * sends a message to a value in a future turn
 * @param object* the recipient
 * @param op the name of the message operation, e.g., "when",
 * @param args further arguments to be forwarded to the operation
 * @returns result {Promise} a promise for the result of the operation
 */
Q.dispatch = dispatch;
function dispatch(object, op, args) {
    return Q(object).dispatch(op, args);
}

Promise.prototype.dispatch = function (op, args) {
    var self = this;
    var deferred = defer();
    nextTick(function () {
        self.promiseDispatch(deferred.resolve, op, args);
    });
    return deferred.promise;
};

/**
 * Gets the value of a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to get
 * @return promise for the property value
 */
Q.get = function (object, key) {
    return Q(object).dispatch("get", [key]);
};

Promise.prototype.get = function (key) {
    return this.dispatch("get", [key]);
};

/**
 * Sets the value of a property in a future turn.
 * @param object    promise or immediate reference for object object
 * @param name      name of property to set
 * @param value     new value of property
 * @return promise for the return value
 */
Q.set = function (object, key, value) {
    return Q(object).dispatch("set", [key, value]);
};

Promise.prototype.set = function (key, value) {
    return this.dispatch("set", [key, value]);
};

/**
 * Deletes a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to delete
 * @return promise for the return value
 */
Q.del = // XXX legacy
Q["delete"] = function (object, key) {
    return Q(object).dispatch("delete", [key]);
};

Promise.prototype.del = // XXX legacy
Promise.prototype["delete"] = function (key) {
    return this.dispatch("delete", [key]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param value     a value to post, typically an array of
 *                  invocation arguments for promises that
 *                  are ultimately backed with `resolve` values,
 *                  as opposed to those backed with URLs
 *                  wherein the posted value can be any
 *                  JSON serializable object.
 * @return promise for the return value
 */
// bound locally because it is used by other methods
Q.mapply = // XXX As proposed by "Redsandro"
Q.post = function (object, name, args) {
    return Q(object).dispatch("post", [name, args]);
};

Promise.prototype.mapply = // XXX As proposed by "Redsandro"
Promise.prototype.post = function (name, args) {
    return this.dispatch("post", [name, args]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param ...args   array of invocation arguments
 * @return promise for the return value
 */
Q.send = // XXX Mark Miller's proposed parlance
Q.mcall = // XXX As proposed by "Redsandro"
Q.invoke = function (object, name /*...args*/) {
    return Q(object).dispatch("post", [name, array_slice(arguments, 2)]);
};

Promise.prototype.send = // XXX Mark Miller's proposed parlance
Promise.prototype.mcall = // XXX As proposed by "Redsandro"
Promise.prototype.invoke = function (name /*...args*/) {
    return this.dispatch("post", [name, array_slice(arguments, 1)]);
};

/**
 * Applies the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param args      array of application arguments
 */
Q.fapply = function (object, args) {
    return Q(object).dispatch("apply", [void 0, args]);
};

Promise.prototype.fapply = function (args) {
    return this.dispatch("apply", [void 0, args]);
};

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q["try"] =
Q.fcall = function (object /* ...args*/) {
    return Q(object).dispatch("apply", [void 0, array_slice(arguments, 1)]);
};

Promise.prototype.fcall = function (/*...args*/) {
    return this.dispatch("apply", [void 0, array_slice(arguments)]);
};

/**
 * Binds the promised function, transforming return values into a fulfilled
 * promise and thrown errors into a rejected one.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q.fbind = function (object /*...args*/) {
    var promise = Q(object);
    var args = array_slice(arguments, 1);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};
Promise.prototype.fbind = function (/*...args*/) {
    var promise = this;
    var args = array_slice(arguments);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};

/**
 * Requests the names of the owned properties of a promised
 * object in a future turn.
 * @param object    promise or immediate reference for target object
 * @return promise for the keys of the eventually settled object
 */
Q.keys = function (object) {
    return Q(object).dispatch("keys", []);
};

Promise.prototype.keys = function () {
    return this.dispatch("keys", []);
};

/**
 * Turns an array of promises into a promise for an array.  If any of
 * the promises gets rejected, the whole array is rejected immediately.
 * @param {Array*} an array (or promise for an array) of values (or
 * promises for values)
 * @returns a promise for an array of the corresponding values
 */
// By Mark Miller
// http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
Q.all = all;
function all(promises) {
    return when(promises, function (promises) {
        var countDown = 0;
        var deferred = defer();
        array_reduce(promises, function (undefined, promise, index) {
            var snapshot;
            if (
                isPromise(promise) &&
                (snapshot = promise.inspect()).state === "fulfilled"
            ) {
                promises[index] = snapshot.value;
            } else {
                ++countDown;
                when(
                    promise,
                    function (value) {
                        promises[index] = value;
                        if (--countDown === 0) {
                            deferred.resolve(promises);
                        }
                    },
                    deferred.reject,
                    function (progress) {
                        deferred.notify({ index: index, value: progress });
                    }
                );
            }
        }, void 0);
        if (countDown === 0) {
            deferred.resolve(promises);
        }
        return deferred.promise;
    });
}

Promise.prototype.all = function () {
    return all(this);
};

/**
 * Waits for all promises to be settled, either fulfilled or
 * rejected.  This is distinct from `all` since that would stop
 * waiting at the first rejection.  The promise returned by
 * `allResolved` will never be rejected.
 * @param promises a promise for an array (or an array) of promises
 * (or values)
 * @return a promise for an array of promises
 */
Q.allResolved = deprecate(allResolved, "allResolved", "allSettled");
function allResolved(promises) {
    return when(promises, function (promises) {
        promises = array_map(promises, Q);
        return when(all(array_map(promises, function (promise) {
            return when(promise, noop, noop);
        })), function () {
            return promises;
        });
    });
}

Promise.prototype.allResolved = function () {
    return allResolved(this);
};

/**
 * @see Promise#allSettled
 */
Q.allSettled = allSettled;
function allSettled(promises) {
    return Q(promises).allSettled();
}

/**
 * Turns an array of promises into a promise for an array of their states (as
 * returned by `inspect`) when they have all settled.
 * @param {Array[Any*]} values an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Array[State]} an array of states for the respective values.
 */
Promise.prototype.allSettled = function () {
    return this.then(function (promises) {
        return all(array_map(promises, function (promise) {
            promise = Q(promise);
            function regardless() {
                return promise.inspect();
            }
            return promise.then(regardless, regardless);
        }));
    });
};

/**
 * Captures the failure of a promise, giving an oportunity to recover
 * with a callback.  If the given promise is fulfilled, the returned
 * promise is fulfilled.
 * @param {Any*} promise for something
 * @param {Function} callback to fulfill the returned promise if the
 * given promise is rejected
 * @returns a promise for the return value of the callback
 */
Q.fail = // XXX legacy
Q["catch"] = function (object, rejected) {
    return Q(object).then(void 0, rejected);
};

Promise.prototype.fail = // XXX legacy
Promise.prototype["catch"] = function (rejected) {
    return this.then(void 0, rejected);
};

/**
 * Attaches a listener that can respond to progress notifications from a
 * promise's originating deferred. This listener receives the exact arguments
 * passed to ``deferred.notify``.
 * @param {Any*} promise for something
 * @param {Function} callback to receive any progress notifications
 * @returns the given promise, unchanged
 */
Q.progress = progress;
function progress(object, progressed) {
    return Q(object).then(void 0, void 0, progressed);
}

Promise.prototype.progress = function (progressed) {
    return this.then(void 0, void 0, progressed);
};

/**
 * Provides an opportunity to observe the settling of a promise,
 * regardless of whether the promise is fulfilled or rejected.  Forwards
 * the resolution to the returned promise when the callback is done.
 * The callback can return a promise to defer completion.
 * @param {Any*} promise
 * @param {Function} callback to observe the resolution of the given
 * promise, takes no arguments.
 * @returns a promise for the resolution of the given promise when
 * ``fin`` is done.
 */
Q.fin = // XXX legacy
Q["finally"] = function (object, callback) {
    return Q(object)["finally"](callback);
};

Promise.prototype.fin = // XXX legacy
Promise.prototype["finally"] = function (callback) {
    callback = Q(callback);
    return this.then(function (value) {
        return callback.fcall().then(function () {
            return value;
        });
    }, function (reason) {
        // TODO attempt to recycle the rejection with "this".
        return callback.fcall().then(function () {
            throw reason;
        });
    });
};

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as exceptions.
 * @param {Any*} promise at the end of a chain of promises
 * @returns nothing
 */
Q.done = function (object, fulfilled, rejected, progress) {
    return Q(object).done(fulfilled, rejected, progress);
};

Promise.prototype.done = function (fulfilled, rejected, progress) {
    var onUnhandledError = function (error) {
        // forward to a future turn so that ``when``
        // does not catch it and turn it into a rejection.
        nextTick(function () {
            makeStackTraceLong(error, promise);
            if (Q.onerror) {
                Q.onerror(error);
            } else {
                throw error;
            }
        });
    };

    // Avoid unnecessary `nextTick`ing via an unnecessary `when`.
    var promise = fulfilled || rejected || progress ?
        this.then(fulfilled, rejected, progress) :
        this;

    if (typeof process === "object" && process && process.domain) {
        onUnhandledError = process.domain.bind(onUnhandledError);
    }

    promise.then(void 0, onUnhandledError);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @param {String} custom error message (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Q.timeout = function (object, ms, message) {
    return Q(object).timeout(ms, message);
};

Promise.prototype.timeout = function (ms, message) {
    var deferred = defer();
    var timeoutId = setTimeout(function () {
        deferred.reject(new Error(message || "Timed out after " + ms + " ms"));
    }, ms);

    this.then(function (value) {
        clearTimeout(timeoutId);
        deferred.resolve(value);
    }, function (exception) {
        clearTimeout(timeoutId);
        deferred.reject(exception);
    }, deferred.notify);

    return deferred.promise;
};

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Q.delay = function (object, timeout) {
    if (timeout === void 0) {
        timeout = object;
        object = void 0;
    }
    return Q(object).delay(timeout);
};

Promise.prototype.delay = function (timeout) {
    return this.then(function (value) {
        var deferred = defer();
        setTimeout(function () {
            deferred.resolve(value);
        }, timeout);
        return deferred.promise;
    });
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided as an array, and returns a promise.
 *
 *      Q.nfapply(FS.readFile, [__filename])
 *      .then(function (content) {
 *      })
 *
 */
Q.nfapply = function (callback, args) {
    return Q(callback).nfapply(args);
};

Promise.prototype.nfapply = function (args) {
    var deferred = defer();
    var nodeArgs = array_slice(args);
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided individually, and returns a promise.
 * @example
 * Q.nfcall(FS.readFile, __filename)
 * .then(function (content) {
 * })
 *
 */
Q.nfcall = function (callback /*...args*/) {
    var args = array_slice(arguments, 1);
    return Q(callback).nfapply(args);
};

Promise.prototype.nfcall = function (/*...args*/) {
    var nodeArgs = array_slice(arguments);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Wraps a NodeJS continuation passing function and returns an equivalent
 * version that returns a promise.
 * @example
 * Q.nfbind(FS.readFile, __filename)("utf-8")
 * .then(console.log)
 * .done()
 */
Q.nfbind =
Q.denodeify = function (callback /*...args*/) {
    var baseArgs = array_slice(arguments, 1);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        Q(callback).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nfbind =
Promise.prototype.denodeify = function (/*...args*/) {
    var args = array_slice(arguments);
    args.unshift(this);
    return Q.denodeify.apply(void 0, args);
};

Q.nbind = function (callback, thisp /*...args*/) {
    var baseArgs = array_slice(arguments, 2);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        function bound() {
            return callback.apply(thisp, arguments);
        }
        Q(bound).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nbind = function (/*thisp, ...args*/) {
    var args = array_slice(arguments, 0);
    args.unshift(this);
    return Q.nbind.apply(void 0, args);
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback with a given array of arguments, plus a provided callback.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param {Array} args arguments to pass to the method; the callback
 * will be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nmapply = // XXX As proposed by "Redsandro"
Q.npost = function (object, name, args) {
    return Q(object).npost(name, args);
};

Promise.prototype.nmapply = // XXX As proposed by "Redsandro"
Promise.prototype.npost = function (name, args) {
    var nodeArgs = array_slice(args || []);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nsend = // XXX Based on Mark Miller's proposed "send"
Q.nmcall = // XXX Based on "Redsandro's" proposal
Q.ninvoke = function (object, name /*...args*/) {
    var nodeArgs = array_slice(arguments, 2);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    Q(object).dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

Promise.prototype.nsend = // XXX Based on Mark Miller's proposed "send"
Promise.prototype.nmcall = // XXX Based on "Redsandro's" proposal
Promise.prototype.ninvoke = function (name /*...args*/) {
    var nodeArgs = array_slice(arguments, 1);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * If a function would like to support both Node continuation-passing-style and
 * promise-returning-style, it can end its internal promise chain with
 * `nodeify(nodeback)`, forwarding the optional nodeback argument.  If the user
 * elects to use a nodeback, the result will be sent there.  If they do not
 * pass a nodeback, they will receive the result promise.
 * @param object a result (or a promise for a result)
 * @param {Function} nodeback a Node.js-style callback
 * @returns either the promise or nothing
 */
Q.nodeify = nodeify;
function nodeify(object, nodeback) {
    return Q(object).nodeify(nodeback);
}

Promise.prototype.nodeify = function (nodeback) {
    if (nodeback) {
        this.then(function (value) {
            nextTick(function () {
                nodeback(null, value);
            });
        }, function (error) {
            nextTick(function () {
                nodeback(error);
            });
        });
    } else {
        return this;
    }
};

// All code before this point will be filtered from stack traces.
var qEndingLine = captureLine();

return Q;

});

},{"__browserify_process":2}],4:[function(require,module,exports){
/**
 * qstart.js - DOM ready promisified with Q
 */

(function (definition) {
    if (typeof exports === "object") {
        module.exports = definition();
    } else {
        Qstart = definition();
    }

})(function () {
    var Q = window.Q || require('q'),
        d = Q.defer(),
        successƒ = function () {
            window.removeEventListener("error", errorƒ);
            d.resolve(window.document);
        },
        errorƒ = function (err) { d.reject(err); };

    window.document.addEventListener("readystatechange", function () {
        if (document.readyState == "complete") successƒ();
    }, false);
    window.addEventListener("error", errorƒ, false);
    return d.promise;
});

},{"q":3}],5:[function(require,module,exports){
/**
 * mask.js - a dead simple mask
 */

(function (definition) {
    if (typeof exports === "object") {
        module.exports = definition();
    } else {
        Mask = definition();
    }

})(function () {

    function setDefaultStyle(el, style) {
        for (var attr in style) el.style[attr] = style[attr];
    }

    var on = (function () {
        if("addEventListener" in window) {
            return function (el, evt, fn, bubble) {
                el.addEventListener(evt, fn, bubble);
            };
        }
        else if("attachEvent" in window) {
            return function (el, evt, fn, bubble) {
                el.attachEvent("on" + evt, fn);
            };
        }
    }());

    var off = (function () {
        if("removeEventListener" in window) {
            return function (el, evt, fn) {
                el.removeEventListener(evt, fn);
            };
        }
        else if("detachEvent" in window) {
            return function (el, evt, fn) {
                el.detachEvent("on" + evt, fn);
            };
        }
    }());

    function setStyle(attr, val) {
        return function (el) {
            return QanimationFrame(el).then(function (el) {
                el.style[attr] = val;
                return el;
            });
        };
    }

    function Zopacityf(visible, d) {
        return Zanimo.transitionf('opacity', visible ? 0.5 : 0, d, 'ease-in-out');
    }

    var Q = window.Q || require('q'),
        Zanimo = window.Zanimo || require('zanimo'),
        QanimationFrame = window.QanimationFrame || require('qanimationframe'),
        inputEvent = window.document.ontouchstart === null ? "touchstart": "click",
        Mask = {},
        defaultStyle = {
            width : '100%',
            height : '100%',
            position : 'absolute',
            top : 0,
            left : 0,
            opacity : 0,
            display : 'none',
            backgroundColor : 'black',
            zIndex : 10
        },
        duration = 500,
        initialized = false,
        displayed = false,
        animated = false,
        transitionf = Zopacityf,
        el = null;

    Mask.init = function (config) {
        if (initialized) return;
        el = window.document.createElement('div');

        if (config) {
            if (config.id) el.id = config.id;
            if (config.backgroundColor)
                defaultStyle.backgroundColor = config.backgroundColor;
            if (config.duration) duration = config.duration;
            if (config.transitionf) transitionf = config.transitionf;
            if (config.zIndex) defaultStyle.zIndex = config.zIndex;
        }

        setDefaultStyle(el, defaultStyle);
        window.document.body.appendChild(el);
        initialized = true;
    };

    Mask.style = function (style) { setDefaultStyle(el, style); };

    Mask.show = function () {
        if(!initialized) return Q.reject("Mask is not initialized!");
        if(animated) return Q.reject("Mask is in use!");
        if(displayed) return Q.reject("Mask is already displayed!");
        animated = true;
        return Zanimo(el)
            .then(setStyle('display', 'block'))
            .then(transitionf(true, duration))
            .then(function (el) {
                on(el, inputEvent, Mask.f);
                return el;
            })
            .fin(function(el) {
                displayed = true;
                animated = false;
                return el;
            });
    };

    Mask.hide = function () {
        if(!initialized) return Q.reject("Mask is not initialized!");
        if(animated) return Q.reject("Mask is in use!");
        if(!displayed) return Q.reject("Mask is already hidden!");
        animated = true;
        return Zanimo(el)
            .then(transitionf(false, duration))
            .then(setStyle('display', 'none'))
            .then(function (el) {
                off(el, inputEvent, Mask.f);
                return el;
            })
            .fin(function(el) {
                displayed = false;
                animated = false;
                return el;
            });
    };

    Mask.onTouch = function(f) { Mask.f = f; };

    return Mask;
});

},{"q":6,"qanimationframe":7,"zanimo":8}],6:[function(require,module,exports){
var process=require("__browserify_process");// vim:ts=4:sts=4:sw=4:
/*!
 *
 * Copyright 2009-2012 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 *
 * With parts by Tyler Close
 * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
 * at http://www.opensource.org/licenses/mit-license.html
 * Forked at ref_send.js version: 2009-05-11
 *
 * With parts by Mark Miller
 * Copyright (C) 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

(function (definition) {
    // Turn off strict mode for this function so we can assign to global.Q
    /* jshint strict: false */

    // This file will function properly as a <script> tag, or a module
    // using CommonJS and NodeJS or RequireJS module formats.  In
    // Common/Node/RequireJS, the module exports the Q API and when
    // executed as a simple <script>, it creates a Q global instead.

    // Montage Require
    if (typeof bootstrap === "function") {
        bootstrap("promise", definition);

    // CommonJS
    } else if (typeof exports === "object") {
        module.exports = definition();

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
        define(definition);

    // SES (Secure EcmaScript)
    } else if (typeof ses !== "undefined") {
        if (!ses.ok()) {
            return;
        } else {
            ses.makeQ = definition;
        }

    // <script>
    } else {
        Q = definition();
    }

})(function () {
"use strict";

var hasStacks = false;
try {
    throw new Error();
} catch (e) {
    hasStacks = !!e.stack;
}

// All code after this point will be filtered from stack traces reported
// by Q.
var qStartingLine = captureLine();
var qFileName;

// shims

// used for fallback in "allResolved"
var noop = function () {};

// Use the fastest possible means to execute a task in a future turn
// of the event loop.
var nextTick =(function () {
    // linked list of tasks (single, with head node)
    var head = {task: void 0, next: null};
    var tail = head;
    var flushing = false;
    var requestTick = void 0;
    var isNodeJS = false;

    function flush() {
        /* jshint loopfunc: true */

        while (head.next) {
            head = head.next;
            var task = head.task;
            head.task = void 0;
            var domain = head.domain;

            if (domain) {
                head.domain = void 0;
                domain.enter();
            }

            try {
                task();

            } catch (e) {
                if (isNodeJS) {
                    // In node, uncaught exceptions are considered fatal errors.
                    // Re-throw them synchronously to interrupt flushing!

                    // Ensure continuation if the uncaught exception is suppressed
                    // listening "uncaughtException" events (as domains does).
                    // Continue in next event to avoid tick recursion.
                    if (domain) {
                        domain.exit();
                    }
                    setTimeout(flush, 0);
                    if (domain) {
                        domain.enter();
                    }

                    throw e;

                } else {
                    // In browsers, uncaught exceptions are not fatal.
                    // Re-throw them asynchronously to avoid slow-downs.
                    setTimeout(function() {
                       throw e;
                    }, 0);
                }
            }

            if (domain) {
                domain.exit();
            }
        }

        flushing = false;
    }

    nextTick = function (task) {
        tail = tail.next = {
            task: task,
            domain: isNodeJS && process.domain,
            next: null
        };

        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };

    if (typeof process !== "undefined" && process.nextTick) {
        // Node.js before 0.9. Note that some fake-Node environments, like the
        // Mocha test runner, introduce a `process` global without a `nextTick`.
        isNodeJS = true;

        requestTick = function () {
            process.nextTick(flush);
        };

    } else if (typeof setImmediate === "function") {
        // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
        if (typeof window !== "undefined") {
            requestTick = setImmediate.bind(window, flush);
        } else {
            requestTick = function () {
                setImmediate(flush);
            };
        }

    } else if (typeof MessageChannel !== "undefined") {
        // modern browsers
        // http://www.nonblocking.io/2011/06/windownexttick.html
        var channel = new MessageChannel();
        // At least Safari Version 6.0.5 (8536.30.1) intermittently cannot create
        // working message ports the first time a page loads.
        channel.port1.onmessage = function () {
            requestTick = requestPortTick;
            channel.port1.onmessage = flush;
            flush();
        };
        var requestPortTick = function () {
            // Opera requires us to provide a message payload, regardless of
            // whether we use it.
            channel.port2.postMessage(0);
        };
        requestTick = function () {
            setTimeout(flush, 0);
            requestPortTick();
        };

    } else {
        // old browsers
        requestTick = function () {
            setTimeout(flush, 0);
        };
    }

    return nextTick;
})();

// Attempt to make generics safe in the face of downstream
// modifications.
// There is no situation where this is necessary.
// If you need a security guarantee, these primordials need to be
// deeply frozen anyway, and if you don’t need a security guarantee,
// this is just plain paranoid.
// However, this does have the nice side-effect of reducing the size
// of the code by reducing x.call() to merely x(), eliminating many
// hard-to-minify characters.
// See Mark Miller’s explanation of what this does.
// http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
var call = Function.call;
function uncurryThis(f) {
    return function () {
        return call.apply(f, arguments);
    };
}
// This is equivalent, but slower:
// uncurryThis = Function_bind.bind(Function_bind.call);
// http://jsperf.com/uncurrythis

var array_slice = uncurryThis(Array.prototype.slice);

var array_reduce = uncurryThis(
    Array.prototype.reduce || function (callback, basis) {
        var index = 0,
            length = this.length;
        // concerning the initial value, if one is not provided
        if (arguments.length === 1) {
            // seek to the first value in the array, accounting
            // for the possibility that is is a sparse array
            do {
                if (index in this) {
                    basis = this[index++];
                    break;
                }
                if (++index >= length) {
                    throw new TypeError();
                }
            } while (1);
        }
        // reduce
        for (; index < length; index++) {
            // account for the possibility that the array is sparse
            if (index in this) {
                basis = callback(basis, this[index], index);
            }
        }
        return basis;
    }
);

var array_indexOf = uncurryThis(
    Array.prototype.indexOf || function (value) {
        // not a very good shim, but good enough for our one use of it
        for (var i = 0; i < this.length; i++) {
            if (this[i] === value) {
                return i;
            }
        }
        return -1;
    }
);

var array_map = uncurryThis(
    Array.prototype.map || function (callback, thisp) {
        var self = this;
        var collect = [];
        array_reduce(self, function (undefined, value, index) {
            collect.push(callback.call(thisp, value, index, self));
        }, void 0);
        return collect;
    }
);

var object_create = Object.create || function (prototype) {
    function Type() { }
    Type.prototype = prototype;
    return new Type();
};

var object_hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

var object_keys = Object.keys || function (object) {
    var keys = [];
    for (var key in object) {
        if (object_hasOwnProperty(object, key)) {
            keys.push(key);
        }
    }
    return keys;
};

var object_toString = uncurryThis(Object.prototype.toString);

function isObject(value) {
    return value === Object(value);
}

// generator related shims

// FIXME: Remove this function once ES6 generators are in SpiderMonkey.
function isStopIteration(exception) {
    return (
        object_toString(exception) === "[object StopIteration]" ||
        exception instanceof QReturnValue
    );
}

// FIXME: Remove this helper and Q.return once ES6 generators are in
// SpiderMonkey.
var QReturnValue;
if (typeof ReturnValue !== "undefined") {
    QReturnValue = ReturnValue;
} else {
    QReturnValue = function (value) {
        this.value = value;
    };
}

// Until V8 3.19 / Chromium 29 is released, SpiderMonkey is the only
// engine that has a deployed base of browsers that support generators.
// However, SM's generators use the Python-inspired semantics of
// outdated ES6 drafts.  We would like to support ES6, but we'd also
// like to make it possible to use generators in deployed browsers, so
// we also support Python-style generators.  At some point we can remove
// this block.
var hasES6Generators;
try {
    /* jshint evil: true, nonew: false */
    new Function("(function* (){ yield 1; })");
    hasES6Generators = true;
} catch (e) {
    hasES6Generators = false;
}

// long stack traces

var STACK_JUMP_SEPARATOR = "From previous event:";

function makeStackTraceLong(error, promise) {
    // If possible, transform the error stack trace by removing Node and Q
    // cruft, then concatenating with the stack trace of `promise`. See #57.
    if (hasStacks &&
        promise.stack &&
        typeof error === "object" &&
        error !== null &&
        error.stack &&
        error.stack.indexOf(STACK_JUMP_SEPARATOR) === -1
    ) {
        var stacks = [];
        for (var p = promise; !!p; p = p.source) {
            if (p.stack) {
                stacks.unshift(p.stack);
            }
        }
        stacks.unshift(error.stack);

        var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
        error.stack = filterStackString(concatedStacks);
    }
}

function filterStackString(stackString) {
    var lines = stackString.split("\n");
    var desiredLines = [];
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];

        if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
            desiredLines.push(line);
        }
    }
    return desiredLines.join("\n");
}

function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 ||
           stackLine.indexOf("(node.js:") !== -1;
}

function getFileNameAndLineNumber(stackLine) {
    // Named functions: "at functionName (filename:lineNumber:columnNumber)"
    // In IE10 function name can have spaces ("Anonymous function") O_o
    var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
    if (attempt1) {
        return [attempt1[1], Number(attempt1[2])];
    }

    // Anonymous functions: "at filename:lineNumber:columnNumber"
    var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
    if (attempt2) {
        return [attempt2[1], Number(attempt2[2])];
    }

    // Firefox style: "function@filename:lineNumber or @filename:lineNumber"
    var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
    if (attempt3) {
        return [attempt3[1], Number(attempt3[2])];
    }
}

function isInternalFrame(stackLine) {
    var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);

    if (!fileNameAndLineNumber) {
        return false;
    }

    var fileName = fileNameAndLineNumber[0];
    var lineNumber = fileNameAndLineNumber[1];

    return fileName === qFileName &&
        lineNumber >= qStartingLine &&
        lineNumber <= qEndingLine;
}

// discover own file name and line number range for filtering stack
// traces
function captureLine() {
    if (!hasStacks) {
        return;
    }

    try {
        throw new Error();
    } catch (e) {
        var lines = e.stack.split("\n");
        var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
        var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
        if (!fileNameAndLineNumber) {
            return;
        }

        qFileName = fileNameAndLineNumber[0];
        return fileNameAndLineNumber[1];
    }
}

function deprecate(callback, name, alternative) {
    return function () {
        if (typeof console !== "undefined" &&
            typeof console.warn === "function") {
            console.warn(name + " is deprecated, use " + alternative +
                         " instead.", new Error("").stack);
        }
        return callback.apply(callback, arguments);
    };
}

// end of shims
// beginning of real work

/**
 * Constructs a promise for an immediate reference, passes promises through, or
 * coerces promises from different systems.
 * @param value immediate reference or promise
 */
function Q(value) {
    // If the object is already a Promise, return it directly.  This enables
    // the resolve function to both be used to created references from objects,
    // but to tolerably coerce non-promises to promises.
    if (isPromise(value)) {
        return value;
    }

    // assimilate thenables
    if (isPromiseAlike(value)) {
        return coerce(value);
    } else {
        return fulfill(value);
    }
}
Q.resolve = Q;

/**
 * Performs a task in a future turn of the event loop.
 * @param {Function} task
 */
Q.nextTick = nextTick;

/**
 * Controls whether or not long stack traces will be on
 */
Q.longStackSupport = false;

/**
 * Constructs a {promise, resolve, reject} object.
 *
 * `resolve` is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke `resolve` with any value that is
 * not a thenable. To reject the promise, invoke `resolve` with a rejected
 * thenable, or invoke `reject` with the reason directly. To resolve the
 * promise to another thenable, thus putting it in the same state, invoke
 * `resolve` with that other thenable.
 */
Q.defer = defer;
function defer() {
    // if "messages" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the messages array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the `resolve` function because it handles both fully
    // non-thenable values and other thenables gracefully.
    var messages = [], progressListeners = [], resolvedPromise;

    var deferred = object_create(defer.prototype);
    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, operands) {
        var args = array_slice(arguments);
        if (messages) {
            messages.push(args);
            if (op === "when" && operands[1]) { // progress operand
                progressListeners.push(operands[1]);
            }
        } else {
            nextTick(function () {
                resolvedPromise.promiseDispatch.apply(resolvedPromise, args);
            });
        }
    };

    // XXX deprecated
    promise.valueOf = deprecate(function () {
        if (messages) {
            return promise;
        }
        var nearerValue = nearer(resolvedPromise);
        if (isPromise(nearerValue)) {
            resolvedPromise = nearerValue; // shorten chain
        }
        return nearerValue;
    }, "valueOf", "inspect");

    promise.inspect = function () {
        if (!resolvedPromise) {
            return { state: "pending" };
        }
        return resolvedPromise.inspect();
    };

    if (Q.longStackSupport && hasStacks) {
        try {
            throw new Error();
        } catch (e) {
            // NOTE: don't try to use `Error.captureStackTrace` or transfer the
            // accessor around; that causes memory leaks as per GH-111. Just
            // reify the stack trace as a string ASAP.
            //
            // At the same time, cut off the first line; it's always just
            // "[object Promise]\n", as per the `toString`.
            promise.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
        }
    }

    // NOTE: we do the checks for `resolvedPromise` in each method, instead of
    // consolidating them into `become`, since otherwise we'd create new
    // promises with the lines `become(whatever(value))`. See e.g. GH-252.

    function become(newPromise) {
        resolvedPromise = newPromise;
        promise.source = newPromise;

        array_reduce(messages, function (undefined, message) {
            nextTick(function () {
                newPromise.promiseDispatch.apply(newPromise, message);
            });
        }, void 0);

        messages = void 0;
        progressListeners = void 0;
    }

    deferred.promise = promise;
    deferred.resolve = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(Q(value));
    };

    deferred.fulfill = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(fulfill(value));
    };
    deferred.reject = function (reason) {
        if (resolvedPromise) {
            return;
        }

        become(reject(reason));
    };
    deferred.notify = function (progress) {
        if (resolvedPromise) {
            return;
        }

        array_reduce(progressListeners, function (undefined, progressListener) {
            nextTick(function () {
                progressListener(progress);
            });
        }, void 0);
    };

    return deferred;
}

/**
 * Creates a Node-style callback that will resolve or reject the deferred
 * promise.
 * @returns a nodeback
 */
defer.prototype.makeNodeResolver = function () {
    var self = this;
    return function (error, value) {
        if (error) {
            self.reject(error);
        } else if (arguments.length > 2) {
            self.resolve(array_slice(arguments, 1));
        } else {
            self.resolve(value);
        }
    };
};

/**
 * @param resolver {Function} a function that returns nothing and accepts
 * the resolve, reject, and notify functions for a deferred.
 * @returns a promise that may be resolved with the given resolve and reject
 * functions, or rejected by a thrown exception in resolver
 */
Q.promise = promise;
function promise(resolver) {
    if (typeof resolver !== "function") {
        throw new TypeError("resolver must be a function.");
    }
    var deferred = defer();
    try {
        resolver(deferred.resolve, deferred.reject, deferred.notify);
    } catch (reason) {
        deferred.reject(reason);
    }
    return deferred.promise;
}

// XXX experimental.  This method is a way to denote that a local value is
// serializable and should be immediately dispatched to a remote upon request,
// instead of passing a reference.
Q.passByCopy = function (object) {
    //freeze(object);
    //passByCopies.set(object, true);
    return object;
};

Promise.prototype.passByCopy = function () {
    //freeze(object);
    //passByCopies.set(object, true);
    return this;
};

/**
 * If two promises eventually fulfill to the same value, promises that value,
 * but otherwise rejects.
 * @param x {Any*}
 * @param y {Any*}
 * @returns {Any*} a promise for x and y if they are the same, but a rejection
 * otherwise.
 *
 */
Q.join = function (x, y) {
    return Q(x).join(y);
};

Promise.prototype.join = function (that) {
    return Q([this, that]).spread(function (x, y) {
        if (x === y) {
            // TODO: "===" should be Object.is or equiv
            return x;
        } else {
            throw new Error("Can't join: not the same: " + x + " " + y);
        }
    });
};

/**
 * Returns a promise for the first of an array of promises to become fulfilled.
 * @param answers {Array[Any*]} promises to race
 * @returns {Any*} the first promise to be fulfilled
 */
Q.race = race;
function race(answerPs) {
    return promise(function(resolve, reject) {
        // Switch to this once we can assume at least ES5
        // answerPs.forEach(function(answerP) {
        //     Q(answerP).then(resolve, reject);
        // });
        // Use this in the meantime
        for (var i = 0, len = answerPs.length; i < len; i++) {
            Q(answerPs[i]).then(resolve, reject);
        }
    });
}

Promise.prototype.race = function () {
    return this.then(Q.race);
};

/**
 * Constructs a Promise with a promise descriptor object and optional fallback
 * function.  The descriptor contains methods like when(rejected), get(name),
 * set(name, value), post(name, args), and delete(name), which all
 * return either a value, a promise for a value, or a rejection.  The fallback
 * accepts the operation name, a resolver, and any further arguments that would
 * have been forwarded to the appropriate method above had a method been
 * provided with the proper name.  The API makes no guarantees about the nature
 * of the returned object, apart from that it is usable whereever promises are
 * bought and sold.
 */
Q.makePromise = Promise;
function Promise(descriptor, fallback, inspect) {
    if (fallback === void 0) {
        fallback = function (op) {
            return reject(new Error(
                "Promise does not support operation: " + op
            ));
        };
    }
    if (inspect === void 0) {
        inspect = function () {
            return {state: "unknown"};
        };
    }

    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, args) {
        var result;
        try {
            if (descriptor[op]) {
                result = descriptor[op].apply(promise, args);
            } else {
                result = fallback.call(promise, op, args);
            }
        } catch (exception) {
            result = reject(exception);
        }
        if (resolve) {
            resolve(result);
        }
    };

    promise.inspect = inspect;

    // XXX deprecated `valueOf` and `exception` support
    if (inspect) {
        var inspected = inspect();
        if (inspected.state === "rejected") {
            promise.exception = inspected.reason;
        }

        promise.valueOf = deprecate(function () {
            var inspected = inspect();
            if (inspected.state === "pending" ||
                inspected.state === "rejected") {
                return promise;
            }
            return inspected.value;
        });
    }

    return promise;
}

Promise.prototype.toString = function () {
    return "[object Promise]";
};

Promise.prototype.then = function (fulfilled, rejected, progressed) {
    var self = this;
    var deferred = defer();
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks

    function _fulfilled(value) {
        try {
            return typeof fulfilled === "function" ? fulfilled(value) : value;
        } catch (exception) {
            return reject(exception);
        }
    }

    function _rejected(exception) {
        if (typeof rejected === "function") {
            makeStackTraceLong(exception, self);
            try {
                return rejected(exception);
            } catch (newException) {
                return reject(newException);
            }
        }
        return reject(exception);
    }

    function _progressed(value) {
        return typeof progressed === "function" ? progressed(value) : value;
    }

    nextTick(function () {
        self.promiseDispatch(function (value) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_fulfilled(value));
        }, "when", [function (exception) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_rejected(exception));
        }]);
    });

    // Progress propagator need to be attached in the current tick.
    self.promiseDispatch(void 0, "when", [void 0, function (value) {
        var newValue;
        var threw = false;
        try {
            newValue = _progressed(value);
        } catch (e) {
            threw = true;
            if (Q.onerror) {
                Q.onerror(e);
            } else {
                throw e;
            }
        }

        if (!threw) {
            deferred.notify(newValue);
        }
    }]);

    return deferred.promise;
};

/**
 * Registers an observer on a promise.
 *
 * Guarantees:
 *
 * 1. that fulfilled and rejected will be called only once.
 * 2. that either the fulfilled callback or the rejected callback will be
 *    called, but not both.
 * 3. that fulfilled and rejected will not be called in this turn.
 *
 * @param value      promise or immediate reference to observe
 * @param fulfilled  function to be called with the fulfilled value
 * @param rejected   function to be called with the rejection exception
 * @param progressed function to be called on any progress notifications
 * @return promise for the return value from the invoked callback
 */
Q.when = when;
function when(value, fulfilled, rejected, progressed) {
    return Q(value).then(fulfilled, rejected, progressed);
}

Promise.prototype.thenResolve = function (value) {
    return this.then(function () { return value; });
};

Q.thenResolve = function (promise, value) {
    return Q(promise).thenResolve(value);
};

Promise.prototype.thenReject = function (reason) {
    return this.then(function () { throw reason; });
};

Q.thenReject = function (promise, reason) {
    return Q(promise).thenReject(reason);
};

/**
 * If an object is not a promise, it is as "near" as possible.
 * If a promise is rejected, it is as "near" as possible too.
 * If it’s a fulfilled promise, the fulfillment value is nearer.
 * If it’s a deferred promise and the deferred has been resolved, the
 * resolution is "nearer".
 * @param object
 * @returns most resolved (nearest) form of the object
 */

// XXX should we re-do this?
Q.nearer = nearer;
function nearer(value) {
    if (isPromise(value)) {
        var inspected = value.inspect();
        if (inspected.state === "fulfilled") {
            return inspected.value;
        }
    }
    return value;
}

/**
 * @returns whether the given object is a promise.
 * Otherwise it is a fulfilled value.
 */
Q.isPromise = isPromise;
function isPromise(object) {
    return isObject(object) &&
        typeof object.promiseDispatch === "function" &&
        typeof object.inspect === "function";
}

Q.isPromiseAlike = isPromiseAlike;
function isPromiseAlike(object) {
    return isObject(object) && typeof object.then === "function";
}

/**
 * @returns whether the given object is a pending promise, meaning not
 * fulfilled or rejected.
 */
Q.isPending = isPending;
function isPending(object) {
    return isPromise(object) && object.inspect().state === "pending";
}

Promise.prototype.isPending = function () {
    return this.inspect().state === "pending";
};

/**
 * @returns whether the given object is a value or fulfilled
 * promise.
 */
Q.isFulfilled = isFulfilled;
function isFulfilled(object) {
    return !isPromise(object) || object.inspect().state === "fulfilled";
}

Promise.prototype.isFulfilled = function () {
    return this.inspect().state === "fulfilled";
};

/**
 * @returns whether the given object is a rejected promise.
 */
Q.isRejected = isRejected;
function isRejected(object) {
    return isPromise(object) && object.inspect().state === "rejected";
}

Promise.prototype.isRejected = function () {
    return this.inspect().state === "rejected";
};

//// BEGIN UNHANDLED REJECTION TRACKING

// This promise library consumes exceptions thrown in handlers so they can be
// handled by a subsequent promise.  The exceptions get added to this array when
// they are created, and removed when they are handled.  Note that in ES6 or
// shimmed environments, this would naturally be a `Set`.
var unhandledReasons = [];
var unhandledRejections = [];
var unhandledReasonsDisplayed = false;
var trackUnhandledRejections = true;
function displayUnhandledReasons() {
    if (
        !unhandledReasonsDisplayed &&
        typeof window !== "undefined" &&
        !window.Touch &&
        window.console
    ) {
        console.warn("[Q] Unhandled rejection reasons (should be empty):",
                     unhandledReasons);
    }

    unhandledReasonsDisplayed = true;
}

function logUnhandledReasons() {
    for (var i = 0; i < unhandledReasons.length; i++) {
        var reason = unhandledReasons[i];
        console.warn("Unhandled rejection reason:", reason);
    }
}

function resetUnhandledRejections() {
    unhandledReasons.length = 0;
    unhandledRejections.length = 0;
    unhandledReasonsDisplayed = false;

    if (!trackUnhandledRejections) {
        trackUnhandledRejections = true;

        // Show unhandled rejection reasons if Node exits without handling an
        // outstanding rejection.  (Note that Browserify presently produces a
        // `process` global without the `EventEmitter` `on` method.)
        if (typeof process !== "undefined" && process.on) {
            process.on("exit", logUnhandledReasons);
        }
    }
}

function trackRejection(promise, reason) {
    if (!trackUnhandledRejections) {
        return;
    }

    unhandledRejections.push(promise);
    if (reason && typeof reason.stack !== "undefined") {
        unhandledReasons.push(reason.stack);
    } else {
        unhandledReasons.push("(no stack) " + reason);
    }
    displayUnhandledReasons();
}

function untrackRejection(promise) {
    if (!trackUnhandledRejections) {
        return;
    }

    var at = array_indexOf(unhandledRejections, promise);
    if (at !== -1) {
        unhandledRejections.splice(at, 1);
        unhandledReasons.splice(at, 1);
    }
}

Q.resetUnhandledRejections = resetUnhandledRejections;

Q.getUnhandledReasons = function () {
    // Make a copy so that consumers can't interfere with our internal state.
    return unhandledReasons.slice();
};

Q.stopUnhandledRejectionTracking = function () {
    resetUnhandledRejections();
    if (typeof process !== "undefined" && process.on) {
        process.removeListener("exit", logUnhandledReasons);
    }
    trackUnhandledRejections = false;
};

resetUnhandledRejections();

//// END UNHANDLED REJECTION TRACKING

/**
 * Constructs a rejected promise.
 * @param reason value describing the failure
 */
Q.reject = reject;
function reject(reason) {
    var rejection = Promise({
        "when": function (rejected) {
            // note that the error has been handled
            if (rejected) {
                untrackRejection(this);
            }
            return rejected ? rejected(reason) : this;
        }
    }, function fallback() {
        return this;
    }, function inspect() {
        return { state: "rejected", reason: reason };
    });

    // Note that the reason has not been handled.
    trackRejection(rejection, reason);

    return rejection;
}

/**
 * Constructs a fulfilled promise for an immediate reference.
 * @param value immediate reference
 */
Q.fulfill = fulfill;
function fulfill(value) {
    return Promise({
        "when": function () {
            return value;
        },
        "get": function (name) {
            return value[name];
        },
        "set": function (name, rhs) {
            value[name] = rhs;
        },
        "delete": function (name) {
            delete value[name];
        },
        "post": function (name, args) {
            // Mark Miller proposes that post with no name should apply a
            // promised function.
            if (name === null || name === void 0) {
                return value.apply(void 0, args);
            } else {
                return value[name].apply(value, args);
            }
        },
        "apply": function (thisp, args) {
            return value.apply(thisp, args);
        },
        "keys": function () {
            return object_keys(value);
        }
    }, void 0, function inspect() {
        return { state: "fulfilled", value: value };
    });
}

/**
 * Converts thenables to Q promises.
 * @param promise thenable promise
 * @returns a Q promise
 */
function coerce(promise) {
    var deferred = defer();
    nextTick(function () {
        try {
            promise.then(deferred.resolve, deferred.reject, deferred.notify);
        } catch (exception) {
            deferred.reject(exception);
        }
    });
    return deferred.promise;
}

/**
 * Annotates an object such that it will never be
 * transferred away from this process over any promise
 * communication channel.
 * @param object
 * @returns promise a wrapping of that object that
 * additionally responds to the "isDef" message
 * without a rejection.
 */
Q.master = master;
function master(object) {
    return Promise({
        "isDef": function () {}
    }, function fallback(op, args) {
        return dispatch(object, op, args);
    }, function () {
        return Q(object).inspect();
    });
}

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param fulfilled callback that receives variadic arguments from the
 * promised array
 * @param rejected callback that receives the exception if the promise
 * is rejected.
 * @returns a promise for the return value or thrown exception of
 * either callback.
 */
Q.spread = spread;
function spread(value, fulfilled, rejected) {
    return Q(value).spread(fulfilled, rejected);
}

Promise.prototype.spread = function (fulfilled, rejected) {
    return this.all().then(function (array) {
        return fulfilled.apply(void 0, array);
    }, rejected);
};

/**
 * The async function is a decorator for generator functions, turning
 * them into asynchronous generators.  Although generators are only part
 * of the newest ECMAScript 6 drafts, this code does not cause syntax
 * errors in older engines.  This code should continue to work and will
 * in fact improve over time as the language improves.
 *
 * ES6 generators are currently part of V8 version 3.19 with the
 * --harmony-generators runtime flag enabled.  SpiderMonkey has had them
 * for longer, but under an older Python-inspired form.  This function
 * works on both kinds of generators.
 *
 * Decorates a generator function such that:
 *  - it may yield promises
 *  - execution will continue when that promise is fulfilled
 *  - the value of the yield expression will be the fulfilled value
 *  - it returns a promise for the return value (when the generator
 *    stops iterating)
 *  - the decorated function returns a promise for the return value
 *    of the generator or the first rejected promise among those
 *    yielded.
 *  - if an error is thrown in the generator, it propagates through
 *    every following yield until it is caught, or until it escapes
 *    the generator function altogether, and is translated into a
 *    rejection for the promise returned by the decorated generator.
 */
Q.async = async;
function async(makeGenerator) {
    return function () {
        // when verb is "send", arg is a value
        // when verb is "throw", arg is an exception
        function continuer(verb, arg) {
            var result;
            if (hasES6Generators) {
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    return reject(exception);
                }
                if (result.done) {
                    return result.value;
                } else {
                    return when(result.value, callback, errback);
                }
            } else {
                // FIXME: Remove this case when SM does ES6 generators.
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    if (isStopIteration(exception)) {
                        return exception.value;
                    } else {
                        return reject(exception);
                    }
                }
                return when(result, callback, errback);
            }
        }
        var generator = makeGenerator.apply(this, arguments);
        var callback = continuer.bind(continuer, "next");
        var errback = continuer.bind(continuer, "throw");
        return callback();
    };
}

/**
 * The spawn function is a small wrapper around async that immediately
 * calls the generator and also ends the promise chain, so that any
 * unhandled errors are thrown instead of forwarded to the error
 * handler. This is useful because it's extremely common to run
 * generators at the top-level to work with libraries.
 */
Q.spawn = spawn;
function spawn(makeGenerator) {
    Q.done(Q.async(makeGenerator)());
}

// FIXME: Remove this interface once ES6 generators are in SpiderMonkey.
/**
 * Throws a ReturnValue exception to stop an asynchronous generator.
 *
 * This interface is a stop-gap measure to support generator return
 * values in older Firefox/SpiderMonkey.  In browsers that support ES6
 * generators like Chromium 29, just use "return" in your generator
 * functions.
 *
 * @param value the return value for the surrounding generator
 * @throws ReturnValue exception with the value.
 * @example
 * // ES6 style
 * Q.async(function* () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      return foo + bar;
 * })
 * // Older SpiderMonkey style
 * Q.async(function () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      Q.return(foo + bar);
 * })
 */
Q["return"] = _return;
function _return(value) {
    throw new QReturnValue(value);
}

/**
 * The promised function decorator ensures that any promise arguments
 * are settled and passed as values (`this` is also settled and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Q.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Q(a), Q(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
Q.promised = promised;
function promised(callback) {
    return function () {
        return spread([this, all(arguments)], function (self, args) {
            return callback.apply(self, args);
        });
    };
}

/**
 * sends a message to a value in a future turn
 * @param object* the recipient
 * @param op the name of the message operation, e.g., "when",
 * @param args further arguments to be forwarded to the operation
 * @returns result {Promise} a promise for the result of the operation
 */
Q.dispatch = dispatch;
function dispatch(object, op, args) {
    return Q(object).dispatch(op, args);
}

Promise.prototype.dispatch = function (op, args) {
    var self = this;
    var deferred = defer();
    nextTick(function () {
        self.promiseDispatch(deferred.resolve, op, args);
    });
    return deferred.promise;
};

/**
 * Gets the value of a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to get
 * @return promise for the property value
 */
Q.get = function (object, key) {
    return Q(object).dispatch("get", [key]);
};

Promise.prototype.get = function (key) {
    return this.dispatch("get", [key]);
};

/**
 * Sets the value of a property in a future turn.
 * @param object    promise or immediate reference for object object
 * @param name      name of property to set
 * @param value     new value of property
 * @return promise for the return value
 */
Q.set = function (object, key, value) {
    return Q(object).dispatch("set", [key, value]);
};

Promise.prototype.set = function (key, value) {
    return this.dispatch("set", [key, value]);
};

/**
 * Deletes a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to delete
 * @return promise for the return value
 */
Q.del = // XXX legacy
Q["delete"] = function (object, key) {
    return Q(object).dispatch("delete", [key]);
};

Promise.prototype.del = // XXX legacy
Promise.prototype["delete"] = function (key) {
    return this.dispatch("delete", [key]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param value     a value to post, typically an array of
 *                  invocation arguments for promises that
 *                  are ultimately backed with `resolve` values,
 *                  as opposed to those backed with URLs
 *                  wherein the posted value can be any
 *                  JSON serializable object.
 * @return promise for the return value
 */
// bound locally because it is used by other methods
Q.mapply = // XXX As proposed by "Redsandro"
Q.post = function (object, name, args) {
    return Q(object).dispatch("post", [name, args]);
};

Promise.prototype.mapply = // XXX As proposed by "Redsandro"
Promise.prototype.post = function (name, args) {
    return this.dispatch("post", [name, args]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param ...args   array of invocation arguments
 * @return promise for the return value
 */
Q.send = // XXX Mark Miller's proposed parlance
Q.mcall = // XXX As proposed by "Redsandro"
Q.invoke = function (object, name /*...args*/) {
    return Q(object).dispatch("post", [name, array_slice(arguments, 2)]);
};

Promise.prototype.send = // XXX Mark Miller's proposed parlance
Promise.prototype.mcall = // XXX As proposed by "Redsandro"
Promise.prototype.invoke = function (name /*...args*/) {
    return this.dispatch("post", [name, array_slice(arguments, 1)]);
};

/**
 * Applies the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param args      array of application arguments
 */
Q.fapply = function (object, args) {
    return Q(object).dispatch("apply", [void 0, args]);
};

Promise.prototype.fapply = function (args) {
    return this.dispatch("apply", [void 0, args]);
};

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q["try"] =
Q.fcall = function (object /* ...args*/) {
    return Q(object).dispatch("apply", [void 0, array_slice(arguments, 1)]);
};

Promise.prototype.fcall = function (/*...args*/) {
    return this.dispatch("apply", [void 0, array_slice(arguments)]);
};

/**
 * Binds the promised function, transforming return values into a fulfilled
 * promise and thrown errors into a rejected one.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q.fbind = function (object /*...args*/) {
    var promise = Q(object);
    var args = array_slice(arguments, 1);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};
Promise.prototype.fbind = function (/*...args*/) {
    var promise = this;
    var args = array_slice(arguments);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};

/**
 * Requests the names of the owned properties of a promised
 * object in a future turn.
 * @param object    promise or immediate reference for target object
 * @return promise for the keys of the eventually settled object
 */
Q.keys = function (object) {
    return Q(object).dispatch("keys", []);
};

Promise.prototype.keys = function () {
    return this.dispatch("keys", []);
};

/**
 * Turns an array of promises into a promise for an array.  If any of
 * the promises gets rejected, the whole array is rejected immediately.
 * @param {Array*} an array (or promise for an array) of values (or
 * promises for values)
 * @returns a promise for an array of the corresponding values
 */
// By Mark Miller
// http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
Q.all = all;
function all(promises) {
    return when(promises, function (promises) {
        var countDown = 0;
        var deferred = defer();
        array_reduce(promises, function (undefined, promise, index) {
            var snapshot;
            if (
                isPromise(promise) &&
                (snapshot = promise.inspect()).state === "fulfilled"
            ) {
                promises[index] = snapshot.value;
            } else {
                ++countDown;
                when(
                    promise,
                    function (value) {
                        promises[index] = value;
                        if (--countDown === 0) {
                            deferred.resolve(promises);
                        }
                    },
                    deferred.reject,
                    function (progress) {
                        deferred.notify({ index: index, value: progress });
                    }
                );
            }
        }, void 0);
        if (countDown === 0) {
            deferred.resolve(promises);
        }
        return deferred.promise;
    });
}

Promise.prototype.all = function () {
    return all(this);
};

/**
 * Waits for all promises to be settled, either fulfilled or
 * rejected.  This is distinct from `all` since that would stop
 * waiting at the first rejection.  The promise returned by
 * `allResolved` will never be rejected.
 * @param promises a promise for an array (or an array) of promises
 * (or values)
 * @return a promise for an array of promises
 */
Q.allResolved = deprecate(allResolved, "allResolved", "allSettled");
function allResolved(promises) {
    return when(promises, function (promises) {
        promises = array_map(promises, Q);
        return when(all(array_map(promises, function (promise) {
            return when(promise, noop, noop);
        })), function () {
            return promises;
        });
    });
}

Promise.prototype.allResolved = function () {
    return allResolved(this);
};

/**
 * @see Promise#allSettled
 */
Q.allSettled = allSettled;
function allSettled(promises) {
    return Q(promises).allSettled();
}

/**
 * Turns an array of promises into a promise for an array of their states (as
 * returned by `inspect`) when they have all settled.
 * @param {Array[Any*]} values an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Array[State]} an array of states for the respective values.
 */
Promise.prototype.allSettled = function () {
    return this.then(function (promises) {
        return all(array_map(promises, function (promise) {
            promise = Q(promise);
            function regardless() {
                return promise.inspect();
            }
            return promise.then(regardless, regardless);
        }));
    });
};

/**
 * Captures the failure of a promise, giving an oportunity to recover
 * with a callback.  If the given promise is fulfilled, the returned
 * promise is fulfilled.
 * @param {Any*} promise for something
 * @param {Function} callback to fulfill the returned promise if the
 * given promise is rejected
 * @returns a promise for the return value of the callback
 */
Q.fail = // XXX legacy
Q["catch"] = function (object, rejected) {
    return Q(object).then(void 0, rejected);
};

Promise.prototype.fail = // XXX legacy
Promise.prototype["catch"] = function (rejected) {
    return this.then(void 0, rejected);
};

/**
 * Attaches a listener that can respond to progress notifications from a
 * promise's originating deferred. This listener receives the exact arguments
 * passed to ``deferred.notify``.
 * @param {Any*} promise for something
 * @param {Function} callback to receive any progress notifications
 * @returns the given promise, unchanged
 */
Q.progress = progress;
function progress(object, progressed) {
    return Q(object).then(void 0, void 0, progressed);
}

Promise.prototype.progress = function (progressed) {
    return this.then(void 0, void 0, progressed);
};

/**
 * Provides an opportunity to observe the settling of a promise,
 * regardless of whether the promise is fulfilled or rejected.  Forwards
 * the resolution to the returned promise when the callback is done.
 * The callback can return a promise to defer completion.
 * @param {Any*} promise
 * @param {Function} callback to observe the resolution of the given
 * promise, takes no arguments.
 * @returns a promise for the resolution of the given promise when
 * ``fin`` is done.
 */
Q.fin = // XXX legacy
Q["finally"] = function (object, callback) {
    return Q(object)["finally"](callback);
};

Promise.prototype.fin = // XXX legacy
Promise.prototype["finally"] = function (callback) {
    callback = Q(callback);
    return this.then(function (value) {
        return callback.fcall().then(function () {
            return value;
        });
    }, function (reason) {
        // TODO attempt to recycle the rejection with "this".
        return callback.fcall().then(function () {
            throw reason;
        });
    });
};

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as exceptions.
 * @param {Any*} promise at the end of a chain of promises
 * @returns nothing
 */
Q.done = function (object, fulfilled, rejected, progress) {
    return Q(object).done(fulfilled, rejected, progress);
};

Promise.prototype.done = function (fulfilled, rejected, progress) {
    var onUnhandledError = function (error) {
        // forward to a future turn so that ``when``
        // does not catch it and turn it into a rejection.
        nextTick(function () {
            makeStackTraceLong(error, promise);
            if (Q.onerror) {
                Q.onerror(error);
            } else {
                throw error;
            }
        });
    };

    // Avoid unnecessary `nextTick`ing via an unnecessary `when`.
    var promise = fulfilled || rejected || progress ?
        this.then(fulfilled, rejected, progress) :
        this;

    if (typeof process === "object" && process && process.domain) {
        onUnhandledError = process.domain.bind(onUnhandledError);
    }

    promise.then(void 0, onUnhandledError);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @param {String} custom error message (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Q.timeout = function (object, ms, message) {
    return Q(object).timeout(ms, message);
};

Promise.prototype.timeout = function (ms, message) {
    var deferred = defer();
    var timeoutId = setTimeout(function () {
        deferred.reject(new Error(message || "Timed out after " + ms + " ms"));
    }, ms);

    this.then(function (value) {
        clearTimeout(timeoutId);
        deferred.resolve(value);
    }, function (exception) {
        clearTimeout(timeoutId);
        deferred.reject(exception);
    }, deferred.notify);

    return deferred.promise;
};

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Q.delay = function (object, timeout) {
    if (timeout === void 0) {
        timeout = object;
        object = void 0;
    }
    return Q(object).delay(timeout);
};

Promise.prototype.delay = function (timeout) {
    return this.then(function (value) {
        var deferred = defer();
        setTimeout(function () {
            deferred.resolve(value);
        }, timeout);
        return deferred.promise;
    });
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided as an array, and returns a promise.
 *
 *      Q.nfapply(FS.readFile, [__filename])
 *      .then(function (content) {
 *      })
 *
 */
Q.nfapply = function (callback, args) {
    return Q(callback).nfapply(args);
};

Promise.prototype.nfapply = function (args) {
    var deferred = defer();
    var nodeArgs = array_slice(args);
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided individually, and returns a promise.
 * @example
 * Q.nfcall(FS.readFile, __filename)
 * .then(function (content) {
 * })
 *
 */
Q.nfcall = function (callback /*...args*/) {
    var args = array_slice(arguments, 1);
    return Q(callback).nfapply(args);
};

Promise.prototype.nfcall = function (/*...args*/) {
    var nodeArgs = array_slice(arguments);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Wraps a NodeJS continuation passing function and returns an equivalent
 * version that returns a promise.
 * @example
 * Q.nfbind(FS.readFile, __filename)("utf-8")
 * .then(console.log)
 * .done()
 */
Q.nfbind =
Q.denodeify = function (callback /*...args*/) {
    var baseArgs = array_slice(arguments, 1);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        Q(callback).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nfbind =
Promise.prototype.denodeify = function (/*...args*/) {
    var args = array_slice(arguments);
    args.unshift(this);
    return Q.denodeify.apply(void 0, args);
};

Q.nbind = function (callback, thisp /*...args*/) {
    var baseArgs = array_slice(arguments, 2);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        function bound() {
            return callback.apply(thisp, arguments);
        }
        Q(bound).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nbind = function (/*thisp, ...args*/) {
    var args = array_slice(arguments, 0);
    args.unshift(this);
    return Q.nbind.apply(void 0, args);
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback with a given array of arguments, plus a provided callback.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param {Array} args arguments to pass to the method; the callback
 * will be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nmapply = // XXX As proposed by "Redsandro"
Q.npost = function (object, name, args) {
    return Q(object).npost(name, args);
};

Promise.prototype.nmapply = // XXX As proposed by "Redsandro"
Promise.prototype.npost = function (name, args) {
    var nodeArgs = array_slice(args || []);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nsend = // XXX Based on Mark Miller's proposed "send"
Q.nmcall = // XXX Based on "Redsandro's" proposal
Q.ninvoke = function (object, name /*...args*/) {
    var nodeArgs = array_slice(arguments, 2);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    Q(object).dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

Promise.prototype.nsend = // XXX Based on Mark Miller's proposed "send"
Promise.prototype.nmcall = // XXX Based on "Redsandro's" proposal
Promise.prototype.ninvoke = function (name /*...args*/) {
    var nodeArgs = array_slice(arguments, 1);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * If a function would like to support both Node continuation-passing-style and
 * promise-returning-style, it can end its internal promise chain with
 * `nodeify(nodeback)`, forwarding the optional nodeback argument.  If the user
 * elects to use a nodeback, the result will be sent there.  If they do not
 * pass a nodeback, they will receive the result promise.
 * @param object a result (or a promise for a result)
 * @param {Function} nodeback a Node.js-style callback
 * @returns either the promise or nothing
 */
Q.nodeify = nodeify;
function nodeify(object, nodeback) {
    return Q(object).nodeify(nodeback);
}

Promise.prototype.nodeify = function (nodeback) {
    if (nodeback) {
        this.then(function (value) {
            nextTick(function () {
                nodeback(null, value);
            });
        }, function (error) {
            nextTick(function () {
                nodeback(error);
            });
        });
    } else {
        return this;
    }
};

// All code before this point will be filtered from stack traces.
var qEndingLine = captureLine();

return Q;

});

},{"__browserify_process":2}],7:[function(require,module,exports){
/*
 * Qanimationframe.js - Promisified requestAnimationFrame with Q
 */
/*jslint newcap: true */
(function (definition) {
    if (typeof exports === "object") {
        module.exports = definition();
    } else {
        window.QanimationFrame = definition();
    }
})(function () {
  "use strict";

  // Import Q
  var Q = window.Q || require("q");

  // requestAnimationFrame polyfill
  var requestAnimationFrame = (function(){
    return window.requestAnimationFrame       ||
           window.oRequestAnimationFrame      ||
           window.msRequestAnimationFrame     ||
           window.mozRequestAnimationFrame    ||
           window.webkitRequestAnimationFrame ||
           function (callback) {
             window.setTimeout(callback, 1000 / 60);
           };
  })();

  // QanimationFrame(elt: DOM.Element) => Promise[DOM.Element]
  // ---
  //
  var QanimationFrame = function (elt) {
    var d = Q.defer();
    requestAnimationFrame(function () {
      d.resolve(elt);
    }, elt);
    return d.promise;
  };

  return QanimationFrame;
});

},{"q":6}],8:[function(require,module,exports){
// Zanimo.js - Promise based CSS3 transitions
// (c) 2011-2013 Paul Panserrieu

(function (definition) {
    if (typeof exports === "object") {
        module.exports = definition();
    } else {
        Zanimo = definition();
    }

})(function () {
    return (function () {

    var Q = window.Q || require('q');

    /**
     * Provides requestAnimationFrame in a cross browser way.
     * @author paulirish / http://paulirish.com/
     */
    if ( !window.requestAnimationFrame ) {
        window.requestAnimationFrame = ( function() {

            return window.webkitRequestAnimationFrame ||
                window.mozRequestAnimationFrame ||
                window.oRequestAnimationFrame ||
                window.msRequestAnimationFrame ||
            function( /* function FrameRequestCallback */ callback,
                      /* DOMElement Element */ element ) {
                window.setTimeout( callback, 1000 / 60 );
            };

        } )();
    };

    /*
     * Private helper dealing with prefix and normalizing
     * css properties, transition/transform values.
     */
    var T = (function (doc) {
        var _matchParenthesis = /(\(.+?\))/g,
            _zeropixel = /^0px$/g,
            _zero = "0",
            _space = / /g,
            _normRegex = /\-([a-z])/g,
            _emptyString = "",
            _transitionend = "transitionend",
            _transition = "transition",
            _prefix = null,
            _dummy = null,
            _dummyTransition = "opacity 100ms linear 0s",
            _repr = function (v, d, t) {
                return v + " " + d + "ms " + (t || "linear");
            },
            _prefixed = { "transform": "" },
            _normReplacef = function(m, g) { return g.toUpperCase(); },
            _normCSSVal = function (match) {
                var args = match.substr(1, match.length-2).split(","), rst = [];
                args.forEach(function (arg) {
                    rst.push(arg.replace(_space, _emptyString).replace(_zeropixel, _zero));
                });
                return "(" + rst.join(",") + ")";
            },
            _norm = function (p) {
                var property = p[0] === "-" ? p.substr(1, p.length-1) : p;
                return property.replace(_normRegex, _normReplacef);
            },
            _normValue = function (val) {
                if (val === null || val === undefined) return "";
                return isNaN(val) ? val.replace(_matchParenthesis, _normCSSVal) : val.toString();
            };

            // detect transition feature
            if( 'WebkitTransition' in doc.body.style ) {
                _transitionend = 'webkitTransitionEnd';
                _prefix = "webkit";
            }

            for (var p in _prefixed)
                _prefixed[p] = _prefix ? "-" + _prefix + "-" + p : p;

            _transition = _prefix ? _prefix + "-" + _transition : _transition
            _transition = _norm(_transition);
            _dummy = doc.createElement("div");
            _dummyTransition = _normValue(_dummyTransition);
            _dummy.style[_transition] = _dummyTransition;
            _dummy = _normValue(_dummy.style[_transition]);

            if (_dummy === _dummyTransition) {
                _repr = function (v, d, t) {
                    return v + " " + d + "ms " + (t || "linear") + " 0s";
                };
            }

        return {
            // prefixed transition string
            t : _transition,
            // transform attr
            transform : _norm(_prefixed["transform"]),
            // prefixed transition end event string
            transitionend : _transitionend,
            // normalize css property
            norm : _norm,
            // prefix a css property if needed
            prefix : function (p) { return _prefixed[p] ? _prefixed[p] : p; },
            repr : _repr,
            // normalize a css transformation string like
            // "translate(340px, 0px, 230px) rotate(340deg )"
            // -> "translate(340px,0,230px) rotate(340deg)"
            normValue : _normValue
        };
    })(window.document),

    isDOM = function (domElt) {
        return domElt && domElt.nodeType ? true : false;
    },

    /**
     * Returns a fulfilled promise wrapping the given DOM element.
     */
    Z = function (domElt) {
        if (isDOM(domElt)) {
            return Q.resolve(domElt);
        }
        else if(Q.isPromise(domElt)) {
            return domElt.then(Z);
        }
        else {
            return Q.reject(new Error("Zanimo require an HTMLElement, or a promise of an HTMLElement"));
        }
    },

    // private helper to add a transition
    add = function (domElt, attr, value, duration, timing) {
        attr = T.prefix(attr);
        if (domElt.style[T.t]) {
            domElt.style[T.t] = domElt.style[T.t]
                                + ", "
                                + T.repr(attr, duration, timing);
        }
        else {
            domElt.style[T.t] = T.repr(attr, duration, timing);
        }
        domElt.style[T.norm(attr)] = value;
    },

    // private helper to remove a transition
    remove = function (domElt, attr, value, duration, timing) {
        var prefixedAttr = T.prefix(attr),
            keys = [];
        for (var k in domElt._zanimo) {
          keys.push(k);
        }
        if(keys.length === 1 && keys[0] === attr) domElt.style[T.t] = "";
    };

    /**
     * Starts a transition on the given DOM element and returns
     * a promise wrapping the DOM element.
     */
    Z.transition = function (domElt, attr, value, duration, timing) {
        var d = Q.defer(), timeout,
            cb = function (clear) {
                if (timeout) { clearTimeout(timeout); timeout = null; }
                remove(domElt, attr, value, duration, timing);
                domElt.removeEventListener(T.transitionend, cbTransitionend);
                if (clear) { delete domElt._zanimo[attr]; }
            },
            cbTransitionend = function (evt) {
                if(T.norm(evt.propertyName) === T.norm(T.prefix(attr))) {
                    cb(true); d.resolve(domElt);
                }
            };

        if (!isDOM(domElt)) {
            d.reject(new Error("Zanimo transition: no DOM element!"));
            return d.promise;
        }
        if(window.isNaN(parseInt(duration, 10))) {
            d.reject(new Error("Zanimo transition: duration must be an integer!"));
            return d.promise;
        }

        domElt.addEventListener(T.transitionend, cbTransitionend);

        window.requestAnimationFrame(function () {
            add(domElt, attr, value, duration, timing);
            timeout = setTimeout(function () {
                var rawVal = domElt.style.getPropertyValue(T.prefix(attr)),
                    domVal = T.normValue(rawVal),
                    givenVal = T.normValue(value);

                cb(true);
                if (domVal === givenVal) { d.resolve(domElt); }
                else {
                    d.reject( new Error("Zanimo transition: "
                        + domElt.id + " with " + attr + " = " + givenVal
                        + ", DOM value=" + domVal
                    ));
                }
            }, duration + 20 );

            domElt._zanimo = domElt._zanimo || { };
            if(domElt._zanimo[attr]) {
                domElt._zanimo[attr].defer.reject(new Error("Zanimo transition "
                    + domElt.id + " with "
                    + attr + "=" + domElt._zanimo[attr].value
                    + " stopped by transition with " + attr + "=" + value
                ));
                domElt._zanimo[attr].cb();
            }
            domElt._zanimo[attr] = {cb: cb, value: value, defer: d};

        }, domElt);

        return d.promise;
    };

    /**
     * A function wrapping Zanimo.transition().
     */
    Z.transitionf = function (attr, value, duration, timing) {
        return function (elt) {
            return Z.transition(elt, attr, value, duration, timing);
        };
    };

    /**
     * Apply a CSS3 transform value to a given DOM element
     * and returns a promise wrapping the DOM element.
     */
    Z.transform = function (elt, value, overwrite) {
        var d = Q.defer();

        if (!isDOM(elt)) {
            d.reject(new Error("Zanimo transform: no DOM element!"));
            return d.promise;
        }

        if(elt._zanimo && elt._zanimo.hasOwnProperty("transform")) {
            elt._zanimo["transform"].defer.reject(new Error(
                "Zanimo transition " + elt.id + " with transform="
                + elt._zanimo["transform"].value
                + " stopped by transform=" + value
            ));
            elt._zanimo["transform"].cb();
        }

        window.requestAnimationFrame(function () {
            elt.style[T.transform] =
                !overwrite ? elt.style[T.transform] + " " + value : value;
            d.resolve(elt);
        }, elt);
        return d.promise;
    };

    /**
     * A function wrapping Zanimo.transform().
     */
    Z.transformf = function (value, overwrite) {
        return function (elt) {
            return Z.transform(elt, value, overwrite);
        };
    };

    /**
     * A function wrapping Zanimo().
     */
    Z.f = function (elt) {
        return function () {
            return Z(elt);
        };
    };

    /**
     * Needed to run parallel Zanimo animations.
     */
    Z.all = function (flist) {
        return function (el) {
            return Q.all(flist.map(function (f) { return f(el); }))
                    .then(function (plist) {
                        var rejected = plist.filter(function (p) { return Q.isRejected(p); });
                        if(rejected.length) return Q.reject(rejected);
                        else return el;
                    });
        }
    };

    Z._T = T;

    return Z;
})();

});

},{"q":6}]},{},[1])
//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvcGV1dGV0cmUvY29kZS91aS1jb21wb25lbnRzL21hc2svZXhhbXBsZS9leGFtcGxlLmpzIiwiL1VzZXJzL3BldXRldHJlL2NvZGUvdWktY29tcG9uZW50cy9tYXNrL2V4YW1wbGUvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luc2VydC1tb2R1bGUtZ2xvYmFscy9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwiL1VzZXJzL3BldXRldHJlL2NvZGUvdWktY29tcG9uZW50cy9tYXNrL2V4YW1wbGUvbm9kZV9tb2R1bGVzL3EvcS5qcyIsIi9Vc2Vycy9wZXV0ZXRyZS9jb2RlL3VpLWNvbXBvbmVudHMvbWFzay9leGFtcGxlL25vZGVfbW9kdWxlcy9xc3RhcnQvc3JjL3FzdGFydC5qcyIsIi9Vc2Vycy9wZXV0ZXRyZS9jb2RlL3VpLWNvbXBvbmVudHMvbWFzay9saWIvbWFzay5qcyIsIi9Vc2Vycy9wZXV0ZXRyZS9jb2RlL3VpLWNvbXBvbmVudHMvbWFzay9ub2RlX21vZHVsZXMvcS9xLmpzIiwiL1VzZXJzL3BldXRldHJlL2NvZGUvdWktY29tcG9uZW50cy9tYXNrL25vZGVfbW9kdWxlcy9xYW5pbWF0aW9uZnJhbWUvc3JjL3FhbmltYXRpb25mcmFtZS5qcyIsIi9Vc2Vycy9wZXV0ZXRyZS9jb2RlL3VpLWNvbXBvbmVudHMvbWFzay9ub2RlX21vZHVsZXMvemFuaW1vL2Rpc3QvemFuaW1vLTAuMC45LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDajVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDajVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbInZhciBRc3RhcnQgPSByZXF1aXJlKCdxc3RhcnQnKSxcbiAgICBRID0gcmVxdWlyZSgncScpLFxuICAgIE1hc2sgPSByZXF1aXJlKCcuLi9saWIvbWFzaycpO1xuXG5mdW5jdGlvbiBtYWluKCkge1xuICAgIE1hc2suaW5pdCgpO1xuICAgIHZhciBidG4gPSB3aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJidG4xXCIpLFxuICAgICAgICBsb2cgPSBmdW5jdGlvbiAocykgeyByZXR1cm4gZnVuY3Rpb24gKCkgeyBjb25zb2xlLmxvZyhzKTsgfSB9LFxuICAgICAgICBlcnIgPSBmdW5jdGlvbiAocykgeyByZXR1cm4gZnVuY3Rpb24gKGVycikgeyBjb25zb2xlLmxvZyhzICsgXCIgXCIgKyBlcnIsIGVyci5zdGFjayk7IH0gfTtcblxuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKHdpbmRvdy5kb2N1bWVudC5vbnRvdWNoc3RhcnQgPT09IG51bGwgPyBcInRvdWNoc3RhcnRcIjogXCJjbGlja1wiLCBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgIE1hc2suc2hvdygpLnRoZW4obG9nKFwiTWFzayBkaXNwbGF5ZWRcIiksIGVycihcIk9vcHMgc2hvdyxcIikpO1xuICAgIH0pO1xuXG4gICAgZnVuY3Rpb24gdG91Y2hBY3Rpb24oZXZ0KSB7XG4gICAgICAgIE1hc2suaGlkZSgpLnRoZW4obG9nKFwiTWFzayBoaWRkZW5cIiksIGVycihcIk9vcHMgaGlkZSxcIikpO1xuICAgIH1cblxuICAgIE1hc2sub25Ub3VjaCh0b3VjaEFjdGlvbik7XG59XG5cblFzdGFydC50aGVuKG1haW4pO1xuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIGlmIChldi5zb3VyY2UgPT09IHdpbmRvdyAmJiBldi5kYXRhID09PSAncHJvY2Vzcy10aWNrJykge1xuICAgICAgICAgICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmbiA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgICAgIHF1ZXVlLnB1c2goZm4pO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKCdwcm9jZXNzLXRpY2snLCAnKicpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICBzZXRUaW1lb3V0KGZuLCAwKTtcbiAgICB9O1xufSkoKTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufVxuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG4iLCJ2YXIgcHJvY2Vzcz1yZXF1aXJlKFwiX19icm93c2VyaWZ5X3Byb2Nlc3NcIik7Ly8gdmltOnRzPTQ6c3RzPTQ6c3c9NDpcbi8qIVxuICpcbiAqIENvcHlyaWdodCAyMDA5LTIwMTIgS3JpcyBLb3dhbCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIE1JVFxuICogbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vZ2l0aHViLmNvbS9rcmlza293YWwvcS9yYXcvbWFzdGVyL0xJQ0VOU0VcbiAqXG4gKiBXaXRoIHBhcnRzIGJ5IFR5bGVyIENsb3NlXG4gKiBDb3B5cmlnaHQgMjAwNy0yMDA5IFR5bGVyIENsb3NlIHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgTUlUIFggbGljZW5zZSBmb3VuZFxuICogYXQgaHR0cDovL3d3dy5vcGVuc291cmNlLm9yZy9saWNlbnNlcy9taXQtbGljZW5zZS5odG1sXG4gKiBGb3JrZWQgYXQgcmVmX3NlbmQuanMgdmVyc2lvbjogMjAwOS0wNS0xMVxuICpcbiAqIFdpdGggcGFydHMgYnkgTWFyayBNaWxsZXJcbiAqIENvcHlyaWdodCAoQykgMjAxMSBHb29nbGUgSW5jLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICpcbiAqL1xuXG4oZnVuY3Rpb24gKGRlZmluaXRpb24pIHtcbiAgICAvLyBUdXJuIG9mZiBzdHJpY3QgbW9kZSBmb3IgdGhpcyBmdW5jdGlvbiBzbyB3ZSBjYW4gYXNzaWduIHRvIGdsb2JhbC5RXG4gICAgLyoganNoaW50IHN0cmljdDogZmFsc2UgKi9cblxuICAgIC8vIFRoaXMgZmlsZSB3aWxsIGZ1bmN0aW9uIHByb3Blcmx5IGFzIGEgPHNjcmlwdD4gdGFnLCBvciBhIG1vZHVsZVxuICAgIC8vIHVzaW5nIENvbW1vbkpTIGFuZCBOb2RlSlMgb3IgUmVxdWlyZUpTIG1vZHVsZSBmb3JtYXRzLiAgSW5cbiAgICAvLyBDb21tb24vTm9kZS9SZXF1aXJlSlMsIHRoZSBtb2R1bGUgZXhwb3J0cyB0aGUgUSBBUEkgYW5kIHdoZW5cbiAgICAvLyBleGVjdXRlZCBhcyBhIHNpbXBsZSA8c2NyaXB0PiwgaXQgY3JlYXRlcyBhIFEgZ2xvYmFsIGluc3RlYWQuXG5cbiAgICAvLyBNb250YWdlIFJlcXVpcmVcbiAgICBpZiAodHlwZW9mIGJvb3RzdHJhcCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIGJvb3RzdHJhcChcInByb21pc2VcIiwgZGVmaW5pdGlvbik7XG5cbiAgICAvLyBDb21tb25KU1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBkZWZpbml0aW9uKCk7XG5cbiAgICAvLyBSZXF1aXJlSlNcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kKSB7XG4gICAgICAgIGRlZmluZShkZWZpbml0aW9uKTtcblxuICAgIC8vIFNFUyAoU2VjdXJlIEVjbWFTY3JpcHQpXG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygc2VzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIGlmICghc2VzLm9rKCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNlcy5tYWtlUSA9IGRlZmluaXRpb247XG4gICAgICAgIH1cblxuICAgIC8vIDxzY3JpcHQ+XG4gICAgfSBlbHNlIHtcbiAgICAgICAgUSA9IGRlZmluaXRpb24oKTtcbiAgICB9XG5cbn0pKGZ1bmN0aW9uICgpIHtcblwidXNlIHN0cmljdFwiO1xuXG52YXIgaGFzU3RhY2tzID0gZmFsc2U7XG50cnkge1xuICAgIHRocm93IG5ldyBFcnJvcigpO1xufSBjYXRjaCAoZSkge1xuICAgIGhhc1N0YWNrcyA9ICEhZS5zdGFjaztcbn1cblxuLy8gQWxsIGNvZGUgYWZ0ZXIgdGhpcyBwb2ludCB3aWxsIGJlIGZpbHRlcmVkIGZyb20gc3RhY2sgdHJhY2VzIHJlcG9ydGVkXG4vLyBieSBRLlxudmFyIHFTdGFydGluZ0xpbmUgPSBjYXB0dXJlTGluZSgpO1xudmFyIHFGaWxlTmFtZTtcblxuLy8gc2hpbXNcblxuLy8gdXNlZCBmb3IgZmFsbGJhY2sgaW4gXCJhbGxSZXNvbHZlZFwiXG52YXIgbm9vcCA9IGZ1bmN0aW9uICgpIHt9O1xuXG4vLyBVc2UgdGhlIGZhc3Rlc3QgcG9zc2libGUgbWVhbnMgdG8gZXhlY3V0ZSBhIHRhc2sgaW4gYSBmdXR1cmUgdHVyblxuLy8gb2YgdGhlIGV2ZW50IGxvb3AuXG52YXIgbmV4dFRpY2sgPShmdW5jdGlvbiAoKSB7XG4gICAgLy8gbGlua2VkIGxpc3Qgb2YgdGFza3MgKHNpbmdsZSwgd2l0aCBoZWFkIG5vZGUpXG4gICAgdmFyIGhlYWQgPSB7dGFzazogdm9pZCAwLCBuZXh0OiBudWxsfTtcbiAgICB2YXIgdGFpbCA9IGhlYWQ7XG4gICAgdmFyIGZsdXNoaW5nID0gZmFsc2U7XG4gICAgdmFyIHJlcXVlc3RUaWNrID0gdm9pZCAwO1xuICAgIHZhciBpc05vZGVKUyA9IGZhbHNlO1xuXG4gICAgZnVuY3Rpb24gZmx1c2goKSB7XG4gICAgICAgIC8qIGpzaGludCBsb29wZnVuYzogdHJ1ZSAqL1xuXG4gICAgICAgIHdoaWxlIChoZWFkLm5leHQpIHtcbiAgICAgICAgICAgIGhlYWQgPSBoZWFkLm5leHQ7XG4gICAgICAgICAgICB2YXIgdGFzayA9IGhlYWQudGFzaztcbiAgICAgICAgICAgIGhlYWQudGFzayA9IHZvaWQgMDtcbiAgICAgICAgICAgIHZhciBkb21haW4gPSBoZWFkLmRvbWFpbjtcblxuICAgICAgICAgICAgaWYgKGRvbWFpbikge1xuICAgICAgICAgICAgICAgIGhlYWQuZG9tYWluID0gdm9pZCAwO1xuICAgICAgICAgICAgICAgIGRvbWFpbi5lbnRlcigpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHRhc2soKTtcblxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGlmIChpc05vZGVKUykge1xuICAgICAgICAgICAgICAgICAgICAvLyBJbiBub2RlLCB1bmNhdWdodCBleGNlcHRpb25zIGFyZSBjb25zaWRlcmVkIGZhdGFsIGVycm9ycy5cbiAgICAgICAgICAgICAgICAgICAgLy8gUmUtdGhyb3cgdGhlbSBzeW5jaHJvbm91c2x5IHRvIGludGVycnVwdCBmbHVzaGluZyFcblxuICAgICAgICAgICAgICAgICAgICAvLyBFbnN1cmUgY29udGludWF0aW9uIGlmIHRoZSB1bmNhdWdodCBleGNlcHRpb24gaXMgc3VwcHJlc3NlZFxuICAgICAgICAgICAgICAgICAgICAvLyBsaXN0ZW5pbmcgXCJ1bmNhdWdodEV4Y2VwdGlvblwiIGV2ZW50cyAoYXMgZG9tYWlucyBkb2VzKS5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ29udGludWUgaW4gbmV4dCBldmVudCB0byBhdm9pZCB0aWNrIHJlY3Vyc2lvbi5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGRvbWFpbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZG9tYWluLmV4aXQoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZsdXNoLCAwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRvbWFpbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZG9tYWluLmVudGVyKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBlO1xuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSW4gYnJvd3NlcnMsIHVuY2F1Z2h0IGV4Y2VwdGlvbnMgYXJlIG5vdCBmYXRhbC5cbiAgICAgICAgICAgICAgICAgICAgLy8gUmUtdGhyb3cgdGhlbSBhc3luY2hyb25vdXNseSB0byBhdm9pZCBzbG93LWRvd25zLlxuICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgICAgICAgICAgICB9LCAwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkb21haW4pIHtcbiAgICAgICAgICAgICAgICBkb21haW4uZXhpdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZmx1c2hpbmcgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBuZXh0VGljayA9IGZ1bmN0aW9uICh0YXNrKSB7XG4gICAgICAgIHRhaWwgPSB0YWlsLm5leHQgPSB7XG4gICAgICAgICAgICB0YXNrOiB0YXNrLFxuICAgICAgICAgICAgZG9tYWluOiBpc05vZGVKUyAmJiBwcm9jZXNzLmRvbWFpbixcbiAgICAgICAgICAgIG5leHQ6IG51bGxcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoIWZsdXNoaW5nKSB7XG4gICAgICAgICAgICBmbHVzaGluZyA9IHRydWU7XG4gICAgICAgICAgICByZXF1ZXN0VGljaygpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGlmICh0eXBlb2YgcHJvY2VzcyAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwcm9jZXNzLm5leHRUaWNrKSB7XG4gICAgICAgIC8vIE5vZGUuanMgYmVmb3JlIDAuOS4gTm90ZSB0aGF0IHNvbWUgZmFrZS1Ob2RlIGVudmlyb25tZW50cywgbGlrZSB0aGVcbiAgICAgICAgLy8gTW9jaGEgdGVzdCBydW5uZXIsIGludHJvZHVjZSBhIGBwcm9jZXNzYCBnbG9iYWwgd2l0aG91dCBhIGBuZXh0VGlja2AuXG4gICAgICAgIGlzTm9kZUpTID0gdHJ1ZTtcblxuICAgICAgICByZXF1ZXN0VGljayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHByb2Nlc3MubmV4dFRpY2soZmx1c2gpO1xuICAgICAgICB9O1xuXG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgLy8gSW4gSUUxMCwgTm9kZS5qcyAwLjkrLCBvciBodHRwczovL2dpdGh1Yi5jb20vTm9ibGVKUy9zZXRJbW1lZGlhdGVcbiAgICAgICAgaWYgKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIHJlcXVlc3RUaWNrID0gc2V0SW1tZWRpYXRlLmJpbmQod2luZG93LCBmbHVzaCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXF1ZXN0VGljayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzZXRJbW1lZGlhdGUoZmx1c2gpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgTWVzc2FnZUNoYW5uZWwgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgLy8gbW9kZXJuIGJyb3dzZXJzXG4gICAgICAgIC8vIGh0dHA6Ly93d3cubm9uYmxvY2tpbmcuaW8vMjAxMS8wNi93aW5kb3duZXh0dGljay5odG1sXG4gICAgICAgIHZhciBjaGFubmVsID0gbmV3IE1lc3NhZ2VDaGFubmVsKCk7XG4gICAgICAgIC8vIEF0IGxlYXN0IFNhZmFyaSBWZXJzaW9uIDYuMC41ICg4NTM2LjMwLjEpIGludGVybWl0dGVudGx5IGNhbm5vdCBjcmVhdGVcbiAgICAgICAgLy8gd29ya2luZyBtZXNzYWdlIHBvcnRzIHRoZSBmaXJzdCB0aW1lIGEgcGFnZSBsb2Fkcy5cbiAgICAgICAgY2hhbm5lbC5wb3J0MS5vbm1lc3NhZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXF1ZXN0VGljayA9IHJlcXVlc3RQb3J0VGljaztcbiAgICAgICAgICAgIGNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gZmx1c2g7XG4gICAgICAgICAgICBmbHVzaCgpO1xuICAgICAgICB9O1xuICAgICAgICB2YXIgcmVxdWVzdFBvcnRUaWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgLy8gT3BlcmEgcmVxdWlyZXMgdXMgdG8gcHJvdmlkZSBhIG1lc3NhZ2UgcGF5bG9hZCwgcmVnYXJkbGVzcyBvZlxuICAgICAgICAgICAgLy8gd2hldGhlciB3ZSB1c2UgaXQuXG4gICAgICAgICAgICBjaGFubmVsLnBvcnQyLnBvc3RNZXNzYWdlKDApO1xuICAgICAgICB9O1xuICAgICAgICByZXF1ZXN0VGljayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoZmx1c2gsIDApO1xuICAgICAgICAgICAgcmVxdWVzdFBvcnRUaWNrKCk7XG4gICAgICAgIH07XG5cbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvbGQgYnJvd3NlcnNcbiAgICAgICAgcmVxdWVzdFRpY2sgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KGZsdXNoLCAwKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gbmV4dFRpY2s7XG59KSgpO1xuXG4vLyBBdHRlbXB0IHRvIG1ha2UgZ2VuZXJpY3Mgc2FmZSBpbiB0aGUgZmFjZSBvZiBkb3duc3RyZWFtXG4vLyBtb2RpZmljYXRpb25zLlxuLy8gVGhlcmUgaXMgbm8gc2l0dWF0aW9uIHdoZXJlIHRoaXMgaXMgbmVjZXNzYXJ5LlxuLy8gSWYgeW91IG5lZWQgYSBzZWN1cml0eSBndWFyYW50ZWUsIHRoZXNlIHByaW1vcmRpYWxzIG5lZWQgdG8gYmVcbi8vIGRlZXBseSBmcm96ZW4gYW55d2F5LCBhbmQgaWYgeW91IGRvbuKAmXQgbmVlZCBhIHNlY3VyaXR5IGd1YXJhbnRlZSxcbi8vIHRoaXMgaXMganVzdCBwbGFpbiBwYXJhbm9pZC5cbi8vIEhvd2V2ZXIsIHRoaXMgZG9lcyBoYXZlIHRoZSBuaWNlIHNpZGUtZWZmZWN0IG9mIHJlZHVjaW5nIHRoZSBzaXplXG4vLyBvZiB0aGUgY29kZSBieSByZWR1Y2luZyB4LmNhbGwoKSB0byBtZXJlbHkgeCgpLCBlbGltaW5hdGluZyBtYW55XG4vLyBoYXJkLXRvLW1pbmlmeSBjaGFyYWN0ZXJzLlxuLy8gU2VlIE1hcmsgTWlsbGVy4oCZcyBleHBsYW5hdGlvbiBvZiB3aGF0IHRoaXMgZG9lcy5cbi8vIGh0dHA6Ly93aWtpLmVjbWFzY3JpcHQub3JnL2Rva3UucGhwP2lkPWNvbnZlbnRpb25zOnNhZmVfbWV0YV9wcm9ncmFtbWluZ1xudmFyIGNhbGwgPSBGdW5jdGlvbi5jYWxsO1xuZnVuY3Rpb24gdW5jdXJyeVRoaXMoZikge1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBjYWxsLmFwcGx5KGYsIGFyZ3VtZW50cyk7XG4gICAgfTtcbn1cbi8vIFRoaXMgaXMgZXF1aXZhbGVudCwgYnV0IHNsb3dlcjpcbi8vIHVuY3VycnlUaGlzID0gRnVuY3Rpb25fYmluZC5iaW5kKEZ1bmN0aW9uX2JpbmQuY2FsbCk7XG4vLyBodHRwOi8vanNwZXJmLmNvbS91bmN1cnJ5dGhpc1xuXG52YXIgYXJyYXlfc2xpY2UgPSB1bmN1cnJ5VGhpcyhBcnJheS5wcm90b3R5cGUuc2xpY2UpO1xuXG52YXIgYXJyYXlfcmVkdWNlID0gdW5jdXJyeVRoaXMoXG4gICAgQXJyYXkucHJvdG90eXBlLnJlZHVjZSB8fCBmdW5jdGlvbiAoY2FsbGJhY2ssIGJhc2lzKSB7XG4gICAgICAgIHZhciBpbmRleCA9IDAsXG4gICAgICAgICAgICBsZW5ndGggPSB0aGlzLmxlbmd0aDtcbiAgICAgICAgLy8gY29uY2VybmluZyB0aGUgaW5pdGlhbCB2YWx1ZSwgaWYgb25lIGlzIG5vdCBwcm92aWRlZFxuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgLy8gc2VlayB0byB0aGUgZmlyc3QgdmFsdWUgaW4gdGhlIGFycmF5LCBhY2NvdW50aW5nXG4gICAgICAgICAgICAvLyBmb3IgdGhlIHBvc3NpYmlsaXR5IHRoYXQgaXMgaXMgYSBzcGFyc2UgYXJyYXlcbiAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICBpZiAoaW5kZXggaW4gdGhpcykge1xuICAgICAgICAgICAgICAgICAgICBiYXNpcyA9IHRoaXNbaW5kZXgrK107XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoKytpbmRleCA+PSBsZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gd2hpbGUgKDEpO1xuICAgICAgICB9XG4gICAgICAgIC8vIHJlZHVjZVxuICAgICAgICBmb3IgKDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICAgIC8vIGFjY291bnQgZm9yIHRoZSBwb3NzaWJpbGl0eSB0aGF0IHRoZSBhcnJheSBpcyBzcGFyc2VcbiAgICAgICAgICAgIGlmIChpbmRleCBpbiB0aGlzKSB7XG4gICAgICAgICAgICAgICAgYmFzaXMgPSBjYWxsYmFjayhiYXNpcywgdGhpc1tpbmRleF0sIGluZGV4KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYmFzaXM7XG4gICAgfVxuKTtcblxudmFyIGFycmF5X2luZGV4T2YgPSB1bmN1cnJ5VGhpcyhcbiAgICBBcnJheS5wcm90b3R5cGUuaW5kZXhPZiB8fCBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgLy8gbm90IGEgdmVyeSBnb29kIHNoaW0sIGJ1dCBnb29kIGVub3VnaCBmb3Igb3VyIG9uZSB1c2Ugb2YgaXRcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAodGhpc1tpXSA9PT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuKTtcblxudmFyIGFycmF5X21hcCA9IHVuY3VycnlUaGlzKFxuICAgIEFycmF5LnByb3RvdHlwZS5tYXAgfHwgZnVuY3Rpb24gKGNhbGxiYWNrLCB0aGlzcCkge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBjb2xsZWN0ID0gW107XG4gICAgICAgIGFycmF5X3JlZHVjZShzZWxmLCBmdW5jdGlvbiAodW5kZWZpbmVkLCB2YWx1ZSwgaW5kZXgpIHtcbiAgICAgICAgICAgIGNvbGxlY3QucHVzaChjYWxsYmFjay5jYWxsKHRoaXNwLCB2YWx1ZSwgaW5kZXgsIHNlbGYpKTtcbiAgICAgICAgfSwgdm9pZCAwKTtcbiAgICAgICAgcmV0dXJuIGNvbGxlY3Q7XG4gICAgfVxuKTtcblxudmFyIG9iamVjdF9jcmVhdGUgPSBPYmplY3QuY3JlYXRlIHx8IGZ1bmN0aW9uIChwcm90b3R5cGUpIHtcbiAgICBmdW5jdGlvbiBUeXBlKCkgeyB9XG4gICAgVHlwZS5wcm90b3R5cGUgPSBwcm90b3R5cGU7XG4gICAgcmV0dXJuIG5ldyBUeXBlKCk7XG59O1xuXG52YXIgb2JqZWN0X2hhc093blByb3BlcnR5ID0gdW5jdXJyeVRoaXMoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSk7XG5cbnZhciBvYmplY3Rfa2V5cyA9IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmplY3QpIHtcbiAgICAgICAgaWYgKG9iamVjdF9oYXNPd25Qcm9wZXJ0eShvYmplY3QsIGtleSkpIHtcbiAgICAgICAgICAgIGtleXMucHVzaChrZXkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBrZXlzO1xufTtcblxudmFyIG9iamVjdF90b1N0cmluZyA9IHVuY3VycnlUaGlzKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcpO1xuXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZSA9PT0gT2JqZWN0KHZhbHVlKTtcbn1cblxuLy8gZ2VuZXJhdG9yIHJlbGF0ZWQgc2hpbXNcblxuLy8gRklYTUU6IFJlbW92ZSB0aGlzIGZ1bmN0aW9uIG9uY2UgRVM2IGdlbmVyYXRvcnMgYXJlIGluIFNwaWRlck1vbmtleS5cbmZ1bmN0aW9uIGlzU3RvcEl0ZXJhdGlvbihleGNlcHRpb24pIHtcbiAgICByZXR1cm4gKFxuICAgICAgICBvYmplY3RfdG9TdHJpbmcoZXhjZXB0aW9uKSA9PT0gXCJbb2JqZWN0IFN0b3BJdGVyYXRpb25dXCIgfHxcbiAgICAgICAgZXhjZXB0aW9uIGluc3RhbmNlb2YgUVJldHVyblZhbHVlXG4gICAgKTtcbn1cblxuLy8gRklYTUU6IFJlbW92ZSB0aGlzIGhlbHBlciBhbmQgUS5yZXR1cm4gb25jZSBFUzYgZ2VuZXJhdG9ycyBhcmUgaW5cbi8vIFNwaWRlck1vbmtleS5cbnZhciBRUmV0dXJuVmFsdWU7XG5pZiAodHlwZW9mIFJldHVyblZhbHVlICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgUVJldHVyblZhbHVlID0gUmV0dXJuVmFsdWU7XG59IGVsc2Uge1xuICAgIFFSZXR1cm5WYWx1ZSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG4gICAgfTtcbn1cblxuLy8gVW50aWwgVjggMy4xOSAvIENocm9taXVtIDI5IGlzIHJlbGVhc2VkLCBTcGlkZXJNb25rZXkgaXMgdGhlIG9ubHlcbi8vIGVuZ2luZSB0aGF0IGhhcyBhIGRlcGxveWVkIGJhc2Ugb2YgYnJvd3NlcnMgdGhhdCBzdXBwb3J0IGdlbmVyYXRvcnMuXG4vLyBIb3dldmVyLCBTTSdzIGdlbmVyYXRvcnMgdXNlIHRoZSBQeXRob24taW5zcGlyZWQgc2VtYW50aWNzIG9mXG4vLyBvdXRkYXRlZCBFUzYgZHJhZnRzLiAgV2Ugd291bGQgbGlrZSB0byBzdXBwb3J0IEVTNiwgYnV0IHdlJ2QgYWxzb1xuLy8gbGlrZSB0byBtYWtlIGl0IHBvc3NpYmxlIHRvIHVzZSBnZW5lcmF0b3JzIGluIGRlcGxveWVkIGJyb3dzZXJzLCBzb1xuLy8gd2UgYWxzbyBzdXBwb3J0IFB5dGhvbi1zdHlsZSBnZW5lcmF0b3JzLiAgQXQgc29tZSBwb2ludCB3ZSBjYW4gcmVtb3ZlXG4vLyB0aGlzIGJsb2NrLlxudmFyIGhhc0VTNkdlbmVyYXRvcnM7XG50cnkge1xuICAgIC8qIGpzaGludCBldmlsOiB0cnVlLCBub25ldzogZmFsc2UgKi9cbiAgICBuZXcgRnVuY3Rpb24oXCIoZnVuY3Rpb24qICgpeyB5aWVsZCAxOyB9KVwiKTtcbiAgICBoYXNFUzZHZW5lcmF0b3JzID0gdHJ1ZTtcbn0gY2F0Y2ggKGUpIHtcbiAgICBoYXNFUzZHZW5lcmF0b3JzID0gZmFsc2U7XG59XG5cbi8vIGxvbmcgc3RhY2sgdHJhY2VzXG5cbnZhciBTVEFDS19KVU1QX1NFUEFSQVRPUiA9IFwiRnJvbSBwcmV2aW91cyBldmVudDpcIjtcblxuZnVuY3Rpb24gbWFrZVN0YWNrVHJhY2VMb25nKGVycm9yLCBwcm9taXNlKSB7XG4gICAgLy8gSWYgcG9zc2libGUsIHRyYW5zZm9ybSB0aGUgZXJyb3Igc3RhY2sgdHJhY2UgYnkgcmVtb3ZpbmcgTm9kZSBhbmQgUVxuICAgIC8vIGNydWZ0LCB0aGVuIGNvbmNhdGVuYXRpbmcgd2l0aCB0aGUgc3RhY2sgdHJhY2Ugb2YgYHByb21pc2VgLiBTZWUgIzU3LlxuICAgIGlmIChoYXNTdGFja3MgJiZcbiAgICAgICAgcHJvbWlzZS5zdGFjayAmJlxuICAgICAgICB0eXBlb2YgZXJyb3IgPT09IFwib2JqZWN0XCIgJiZcbiAgICAgICAgZXJyb3IgIT09IG51bGwgJiZcbiAgICAgICAgZXJyb3Iuc3RhY2sgJiZcbiAgICAgICAgZXJyb3Iuc3RhY2suaW5kZXhPZihTVEFDS19KVU1QX1NFUEFSQVRPUikgPT09IC0xXG4gICAgKSB7XG4gICAgICAgIHZhciBzdGFja3MgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgcCA9IHByb21pc2U7ICEhcDsgcCA9IHAuc291cmNlKSB7XG4gICAgICAgICAgICBpZiAocC5zdGFjaykge1xuICAgICAgICAgICAgICAgIHN0YWNrcy51bnNoaWZ0KHAuc3RhY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHN0YWNrcy51bnNoaWZ0KGVycm9yLnN0YWNrKTtcblxuICAgICAgICB2YXIgY29uY2F0ZWRTdGFja3MgPSBzdGFja3Muam9pbihcIlxcblwiICsgU1RBQ0tfSlVNUF9TRVBBUkFUT1IgKyBcIlxcblwiKTtcbiAgICAgICAgZXJyb3Iuc3RhY2sgPSBmaWx0ZXJTdGFja1N0cmluZyhjb25jYXRlZFN0YWNrcyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBmaWx0ZXJTdGFja1N0cmluZyhzdGFja1N0cmluZykge1xuICAgIHZhciBsaW5lcyA9IHN0YWNrU3RyaW5nLnNwbGl0KFwiXFxuXCIpO1xuICAgIHZhciBkZXNpcmVkTGluZXMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBsaW5lID0gbGluZXNbaV07XG5cbiAgICAgICAgaWYgKCFpc0ludGVybmFsRnJhbWUobGluZSkgJiYgIWlzTm9kZUZyYW1lKGxpbmUpICYmIGxpbmUpIHtcbiAgICAgICAgICAgIGRlc2lyZWRMaW5lcy5wdXNoKGxpbmUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBkZXNpcmVkTGluZXMuam9pbihcIlxcblwiKTtcbn1cblxuZnVuY3Rpb24gaXNOb2RlRnJhbWUoc3RhY2tMaW5lKSB7XG4gICAgcmV0dXJuIHN0YWNrTGluZS5pbmRleE9mKFwiKG1vZHVsZS5qczpcIikgIT09IC0xIHx8XG4gICAgICAgICAgIHN0YWNrTGluZS5pbmRleE9mKFwiKG5vZGUuanM6XCIpICE9PSAtMTtcbn1cblxuZnVuY3Rpb24gZ2V0RmlsZU5hbWVBbmRMaW5lTnVtYmVyKHN0YWNrTGluZSkge1xuICAgIC8vIE5hbWVkIGZ1bmN0aW9uczogXCJhdCBmdW5jdGlvbk5hbWUgKGZpbGVuYW1lOmxpbmVOdW1iZXI6Y29sdW1uTnVtYmVyKVwiXG4gICAgLy8gSW4gSUUxMCBmdW5jdGlvbiBuYW1lIGNhbiBoYXZlIHNwYWNlcyAoXCJBbm9ueW1vdXMgZnVuY3Rpb25cIikgT19vXG4gICAgdmFyIGF0dGVtcHQxID0gL2F0IC4rIFxcKCguKyk6KFxcZCspOig/OlxcZCspXFwpJC8uZXhlYyhzdGFja0xpbmUpO1xuICAgIGlmIChhdHRlbXB0MSkge1xuICAgICAgICByZXR1cm4gW2F0dGVtcHQxWzFdLCBOdW1iZXIoYXR0ZW1wdDFbMl0pXTtcbiAgICB9XG5cbiAgICAvLyBBbm9ueW1vdXMgZnVuY3Rpb25zOiBcImF0IGZpbGVuYW1lOmxpbmVOdW1iZXI6Y29sdW1uTnVtYmVyXCJcbiAgICB2YXIgYXR0ZW1wdDIgPSAvYXQgKFteIF0rKTooXFxkKyk6KD86XFxkKykkLy5leGVjKHN0YWNrTGluZSk7XG4gICAgaWYgKGF0dGVtcHQyKSB7XG4gICAgICAgIHJldHVybiBbYXR0ZW1wdDJbMV0sIE51bWJlcihhdHRlbXB0MlsyXSldO1xuICAgIH1cblxuICAgIC8vIEZpcmVmb3ggc3R5bGU6IFwiZnVuY3Rpb25AZmlsZW5hbWU6bGluZU51bWJlciBvciBAZmlsZW5hbWU6bGluZU51bWJlclwiXG4gICAgdmFyIGF0dGVtcHQzID0gLy4qQCguKyk6KFxcZCspJC8uZXhlYyhzdGFja0xpbmUpO1xuICAgIGlmIChhdHRlbXB0Mykge1xuICAgICAgICByZXR1cm4gW2F0dGVtcHQzWzFdLCBOdW1iZXIoYXR0ZW1wdDNbMl0pXTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGlzSW50ZXJuYWxGcmFtZShzdGFja0xpbmUpIHtcbiAgICB2YXIgZmlsZU5hbWVBbmRMaW5lTnVtYmVyID0gZ2V0RmlsZU5hbWVBbmRMaW5lTnVtYmVyKHN0YWNrTGluZSk7XG5cbiAgICBpZiAoIWZpbGVOYW1lQW5kTGluZU51bWJlcikge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdmFyIGZpbGVOYW1lID0gZmlsZU5hbWVBbmRMaW5lTnVtYmVyWzBdO1xuICAgIHZhciBsaW5lTnVtYmVyID0gZmlsZU5hbWVBbmRMaW5lTnVtYmVyWzFdO1xuXG4gICAgcmV0dXJuIGZpbGVOYW1lID09PSBxRmlsZU5hbWUgJiZcbiAgICAgICAgbGluZU51bWJlciA+PSBxU3RhcnRpbmdMaW5lICYmXG4gICAgICAgIGxpbmVOdW1iZXIgPD0gcUVuZGluZ0xpbmU7XG59XG5cbi8vIGRpc2NvdmVyIG93biBmaWxlIG5hbWUgYW5kIGxpbmUgbnVtYmVyIHJhbmdlIGZvciBmaWx0ZXJpbmcgc3RhY2tcbi8vIHRyYWNlc1xuZnVuY3Rpb24gY2FwdHVyZUxpbmUoKSB7XG4gICAgaWYgKCFoYXNTdGFja3MpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdmFyIGxpbmVzID0gZS5zdGFjay5zcGxpdChcIlxcblwiKTtcbiAgICAgICAgdmFyIGZpcnN0TGluZSA9IGxpbmVzWzBdLmluZGV4T2YoXCJAXCIpID4gMCA/IGxpbmVzWzFdIDogbGluZXNbMl07XG4gICAgICAgIHZhciBmaWxlTmFtZUFuZExpbmVOdW1iZXIgPSBnZXRGaWxlTmFtZUFuZExpbmVOdW1iZXIoZmlyc3RMaW5lKTtcbiAgICAgICAgaWYgKCFmaWxlTmFtZUFuZExpbmVOdW1iZXIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHFGaWxlTmFtZSA9IGZpbGVOYW1lQW5kTGluZU51bWJlclswXTtcbiAgICAgICAgcmV0dXJuIGZpbGVOYW1lQW5kTGluZU51bWJlclsxXTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRlcHJlY2F0ZShjYWxsYmFjaywgbmFtZSwgYWx0ZXJuYXRpdmUpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIgJiZcbiAgICAgICAgICAgIHR5cGVvZiBjb25zb2xlLndhcm4gPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKG5hbWUgKyBcIiBpcyBkZXByZWNhdGVkLCB1c2UgXCIgKyBhbHRlcm5hdGl2ZSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgXCIgaW5zdGVhZC5cIiwgbmV3IEVycm9yKFwiXCIpLnN0YWNrKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2suYXBwbHkoY2FsbGJhY2ssIGFyZ3VtZW50cyk7XG4gICAgfTtcbn1cblxuLy8gZW5kIG9mIHNoaW1zXG4vLyBiZWdpbm5pbmcgb2YgcmVhbCB3b3JrXG5cbi8qKlxuICogQ29uc3RydWN0cyBhIHByb21pc2UgZm9yIGFuIGltbWVkaWF0ZSByZWZlcmVuY2UsIHBhc3NlcyBwcm9taXNlcyB0aHJvdWdoLCBvclxuICogY29lcmNlcyBwcm9taXNlcyBmcm9tIGRpZmZlcmVudCBzeXN0ZW1zLlxuICogQHBhcmFtIHZhbHVlIGltbWVkaWF0ZSByZWZlcmVuY2Ugb3IgcHJvbWlzZVxuICovXG5mdW5jdGlvbiBRKHZhbHVlKSB7XG4gICAgLy8gSWYgdGhlIG9iamVjdCBpcyBhbHJlYWR5IGEgUHJvbWlzZSwgcmV0dXJuIGl0IGRpcmVjdGx5LiAgVGhpcyBlbmFibGVzXG4gICAgLy8gdGhlIHJlc29sdmUgZnVuY3Rpb24gdG8gYm90aCBiZSB1c2VkIHRvIGNyZWF0ZWQgcmVmZXJlbmNlcyBmcm9tIG9iamVjdHMsXG4gICAgLy8gYnV0IHRvIHRvbGVyYWJseSBjb2VyY2Ugbm9uLXByb21pc2VzIHRvIHByb21pc2VzLlxuICAgIGlmIChpc1Byb21pc2UodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICAvLyBhc3NpbWlsYXRlIHRoZW5hYmxlc1xuICAgIGlmIChpc1Byb21pc2VBbGlrZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIGNvZXJjZSh2YWx1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZ1bGZpbGwodmFsdWUpO1xuICAgIH1cbn1cblEucmVzb2x2ZSA9IFE7XG5cbi8qKlxuICogUGVyZm9ybXMgYSB0YXNrIGluIGEgZnV0dXJlIHR1cm4gb2YgdGhlIGV2ZW50IGxvb3AuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSB0YXNrXG4gKi9cblEubmV4dFRpY2sgPSBuZXh0VGljaztcblxuLyoqXG4gKiBDb250cm9scyB3aGV0aGVyIG9yIG5vdCBsb25nIHN0YWNrIHRyYWNlcyB3aWxsIGJlIG9uXG4gKi9cblEubG9uZ1N0YWNrU3VwcG9ydCA9IGZhbHNlO1xuXG4vKipcbiAqIENvbnN0cnVjdHMgYSB7cHJvbWlzZSwgcmVzb2x2ZSwgcmVqZWN0fSBvYmplY3QuXG4gKlxuICogYHJlc29sdmVgIGlzIGEgY2FsbGJhY2sgdG8gaW52b2tlIHdpdGggYSBtb3JlIHJlc29sdmVkIHZhbHVlIGZvciB0aGVcbiAqIHByb21pc2UuIFRvIGZ1bGZpbGwgdGhlIHByb21pc2UsIGludm9rZSBgcmVzb2x2ZWAgd2l0aCBhbnkgdmFsdWUgdGhhdCBpc1xuICogbm90IGEgdGhlbmFibGUuIFRvIHJlamVjdCB0aGUgcHJvbWlzZSwgaW52b2tlIGByZXNvbHZlYCB3aXRoIGEgcmVqZWN0ZWRcbiAqIHRoZW5hYmxlLCBvciBpbnZva2UgYHJlamVjdGAgd2l0aCB0aGUgcmVhc29uIGRpcmVjdGx5LiBUbyByZXNvbHZlIHRoZVxuICogcHJvbWlzZSB0byBhbm90aGVyIHRoZW5hYmxlLCB0aHVzIHB1dHRpbmcgaXQgaW4gdGhlIHNhbWUgc3RhdGUsIGludm9rZVxuICogYHJlc29sdmVgIHdpdGggdGhhdCBvdGhlciB0aGVuYWJsZS5cbiAqL1xuUS5kZWZlciA9IGRlZmVyO1xuZnVuY3Rpb24gZGVmZXIoKSB7XG4gICAgLy8gaWYgXCJtZXNzYWdlc1wiIGlzIGFuIFwiQXJyYXlcIiwgdGhhdCBpbmRpY2F0ZXMgdGhhdCB0aGUgcHJvbWlzZSBoYXMgbm90IHlldFxuICAgIC8vIGJlZW4gcmVzb2x2ZWQuICBJZiBpdCBpcyBcInVuZGVmaW5lZFwiLCBpdCBoYXMgYmVlbiByZXNvbHZlZC4gIEVhY2hcbiAgICAvLyBlbGVtZW50IG9mIHRoZSBtZXNzYWdlcyBhcnJheSBpcyBpdHNlbGYgYW4gYXJyYXkgb2YgY29tcGxldGUgYXJndW1lbnRzIHRvXG4gICAgLy8gZm9yd2FyZCB0byB0aGUgcmVzb2x2ZWQgcHJvbWlzZS4gIFdlIGNvZXJjZSB0aGUgcmVzb2x1dGlvbiB2YWx1ZSB0byBhXG4gICAgLy8gcHJvbWlzZSB1c2luZyB0aGUgYHJlc29sdmVgIGZ1bmN0aW9uIGJlY2F1c2UgaXQgaGFuZGxlcyBib3RoIGZ1bGx5XG4gICAgLy8gbm9uLXRoZW5hYmxlIHZhbHVlcyBhbmQgb3RoZXIgdGhlbmFibGVzIGdyYWNlZnVsbHkuXG4gICAgdmFyIG1lc3NhZ2VzID0gW10sIHByb2dyZXNzTGlzdGVuZXJzID0gW10sIHJlc29sdmVkUHJvbWlzZTtcblxuICAgIHZhciBkZWZlcnJlZCA9IG9iamVjdF9jcmVhdGUoZGVmZXIucHJvdG90eXBlKTtcbiAgICB2YXIgcHJvbWlzZSA9IG9iamVjdF9jcmVhdGUoUHJvbWlzZS5wcm90b3R5cGUpO1xuXG4gICAgcHJvbWlzZS5wcm9taXNlRGlzcGF0Y2ggPSBmdW5jdGlvbiAocmVzb2x2ZSwgb3AsIG9wZXJhbmRzKSB7XG4gICAgICAgIHZhciBhcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzKTtcbiAgICAgICAgaWYgKG1lc3NhZ2VzKSB7XG4gICAgICAgICAgICBtZXNzYWdlcy5wdXNoKGFyZ3MpO1xuICAgICAgICAgICAgaWYgKG9wID09PSBcIndoZW5cIiAmJiBvcGVyYW5kc1sxXSkgeyAvLyBwcm9ncmVzcyBvcGVyYW5kXG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3NMaXN0ZW5lcnMucHVzaChvcGVyYW5kc1sxXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRQcm9taXNlLnByb21pc2VEaXNwYXRjaC5hcHBseShyZXNvbHZlZFByb21pc2UsIGFyZ3MpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gWFhYIGRlcHJlY2F0ZWRcbiAgICBwcm9taXNlLnZhbHVlT2YgPSBkZXByZWNhdGUoZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAobWVzc2FnZXMpIHtcbiAgICAgICAgICAgIHJldHVybiBwcm9taXNlO1xuICAgICAgICB9XG4gICAgICAgIHZhciBuZWFyZXJWYWx1ZSA9IG5lYXJlcihyZXNvbHZlZFByb21pc2UpO1xuICAgICAgICBpZiAoaXNQcm9taXNlKG5lYXJlclZhbHVlKSkge1xuICAgICAgICAgICAgcmVzb2x2ZWRQcm9taXNlID0gbmVhcmVyVmFsdWU7IC8vIHNob3J0ZW4gY2hhaW5cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmVhcmVyVmFsdWU7XG4gICAgfSwgXCJ2YWx1ZU9mXCIsIFwiaW5zcGVjdFwiKTtcblxuICAgIHByb21pc2UuaW5zcGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCFyZXNvbHZlZFByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN0YXRlOiBcInBlbmRpbmdcIiB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXNvbHZlZFByb21pc2UuaW5zcGVjdCgpO1xuICAgIH07XG5cbiAgICBpZiAoUS5sb25nU3RhY2tTdXBwb3J0ICYmIGhhc1N0YWNrcykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIC8vIE5PVEU6IGRvbid0IHRyeSB0byB1c2UgYEVycm9yLmNhcHR1cmVTdGFja1RyYWNlYCBvciB0cmFuc2ZlciB0aGVcbiAgICAgICAgICAgIC8vIGFjY2Vzc29yIGFyb3VuZDsgdGhhdCBjYXVzZXMgbWVtb3J5IGxlYWtzIGFzIHBlciBHSC0xMTEuIEp1c3RcbiAgICAgICAgICAgIC8vIHJlaWZ5IHRoZSBzdGFjayB0cmFjZSBhcyBhIHN0cmluZyBBU0FQLlxuICAgICAgICAgICAgLy9cbiAgICAgICAgICAgIC8vIEF0IHRoZSBzYW1lIHRpbWUsIGN1dCBvZmYgdGhlIGZpcnN0IGxpbmU7IGl0J3MgYWx3YXlzIGp1c3RcbiAgICAgICAgICAgIC8vIFwiW29iamVjdCBQcm9taXNlXVxcblwiLCBhcyBwZXIgdGhlIGB0b1N0cmluZ2AuXG4gICAgICAgICAgICBwcm9taXNlLnN0YWNrID0gZS5zdGFjay5zdWJzdHJpbmcoZS5zdGFjay5pbmRleE9mKFwiXFxuXCIpICsgMSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBOT1RFOiB3ZSBkbyB0aGUgY2hlY2tzIGZvciBgcmVzb2x2ZWRQcm9taXNlYCBpbiBlYWNoIG1ldGhvZCwgaW5zdGVhZCBvZlxuICAgIC8vIGNvbnNvbGlkYXRpbmcgdGhlbSBpbnRvIGBiZWNvbWVgLCBzaW5jZSBvdGhlcndpc2Ugd2UnZCBjcmVhdGUgbmV3XG4gICAgLy8gcHJvbWlzZXMgd2l0aCB0aGUgbGluZXMgYGJlY29tZSh3aGF0ZXZlcih2YWx1ZSkpYC4gU2VlIGUuZy4gR0gtMjUyLlxuXG4gICAgZnVuY3Rpb24gYmVjb21lKG5ld1Byb21pc2UpIHtcbiAgICAgICAgcmVzb2x2ZWRQcm9taXNlID0gbmV3UHJvbWlzZTtcbiAgICAgICAgcHJvbWlzZS5zb3VyY2UgPSBuZXdQcm9taXNlO1xuXG4gICAgICAgIGFycmF5X3JlZHVjZShtZXNzYWdlcywgZnVuY3Rpb24gKHVuZGVmaW5lZCwgbWVzc2FnZSkge1xuICAgICAgICAgICAgbmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIG5ld1Byb21pc2UucHJvbWlzZURpc3BhdGNoLmFwcGx5KG5ld1Byb21pc2UsIG1lc3NhZ2UpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIHZvaWQgMCk7XG5cbiAgICAgICAgbWVzc2FnZXMgPSB2b2lkIDA7XG4gICAgICAgIHByb2dyZXNzTGlzdGVuZXJzID0gdm9pZCAwO1xuICAgIH1cblxuICAgIGRlZmVycmVkLnByb21pc2UgPSBwcm9taXNlO1xuICAgIGRlZmVycmVkLnJlc29sdmUgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgaWYgKHJlc29sdmVkUHJvbWlzZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgYmVjb21lKFEodmFsdWUpKTtcbiAgICB9O1xuXG4gICAgZGVmZXJyZWQuZnVsZmlsbCA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICBpZiAocmVzb2x2ZWRQcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBiZWNvbWUoZnVsZmlsbCh2YWx1ZSkpO1xuICAgIH07XG4gICAgZGVmZXJyZWQucmVqZWN0ID0gZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICBpZiAocmVzb2x2ZWRQcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBiZWNvbWUocmVqZWN0KHJlYXNvbikpO1xuICAgIH07XG4gICAgZGVmZXJyZWQubm90aWZ5ID0gZnVuY3Rpb24gKHByb2dyZXNzKSB7XG4gICAgICAgIGlmIChyZXNvbHZlZFByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGFycmF5X3JlZHVjZShwcm9ncmVzc0xpc3RlbmVycywgZnVuY3Rpb24gKHVuZGVmaW5lZCwgcHJvZ3Jlc3NMaXN0ZW5lcikge1xuICAgICAgICAgICAgbmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHByb2dyZXNzTGlzdGVuZXIocHJvZ3Jlc3MpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIHZvaWQgMCk7XG4gICAgfTtcblxuICAgIHJldHVybiBkZWZlcnJlZDtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgTm9kZS1zdHlsZSBjYWxsYmFjayB0aGF0IHdpbGwgcmVzb2x2ZSBvciByZWplY3QgdGhlIGRlZmVycmVkXG4gKiBwcm9taXNlLlxuICogQHJldHVybnMgYSBub2RlYmFja1xuICovXG5kZWZlci5wcm90b3R5cGUubWFrZU5vZGVSZXNvbHZlciA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIChlcnJvciwgdmFsdWUpIHtcbiAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgICBzZWxmLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0gZWxzZSBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgIHNlbGYucmVzb2x2ZShhcnJheV9zbGljZShhcmd1bWVudHMsIDEpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYucmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9O1xufTtcblxuLyoqXG4gKiBAcGFyYW0gcmVzb2x2ZXIge0Z1bmN0aW9ufSBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBub3RoaW5nIGFuZCBhY2NlcHRzXG4gKiB0aGUgcmVzb2x2ZSwgcmVqZWN0LCBhbmQgbm90aWZ5IGZ1bmN0aW9ucyBmb3IgYSBkZWZlcnJlZC5cbiAqIEByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IG1heSBiZSByZXNvbHZlZCB3aXRoIHRoZSBnaXZlbiByZXNvbHZlIGFuZCByZWplY3RcbiAqIGZ1bmN0aW9ucywgb3IgcmVqZWN0ZWQgYnkgYSB0aHJvd24gZXhjZXB0aW9uIGluIHJlc29sdmVyXG4gKi9cblEucHJvbWlzZSA9IHByb21pc2U7XG5mdW5jdGlvbiBwcm9taXNlKHJlc29sdmVyKSB7XG4gICAgaWYgKHR5cGVvZiByZXNvbHZlciAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJyZXNvbHZlciBtdXN0IGJlIGEgZnVuY3Rpb24uXCIpO1xuICAgIH1cbiAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgIHRyeSB7XG4gICAgICAgIHJlc29sdmVyKGRlZmVycmVkLnJlc29sdmUsIGRlZmVycmVkLnJlamVjdCwgZGVmZXJyZWQubm90aWZ5KTtcbiAgICB9IGNhdGNoIChyZWFzb24pIHtcbiAgICAgICAgZGVmZXJyZWQucmVqZWN0KHJlYXNvbik7XG4gICAgfVxuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufVxuXG4vLyBYWFggZXhwZXJpbWVudGFsLiAgVGhpcyBtZXRob2QgaXMgYSB3YXkgdG8gZGVub3RlIHRoYXQgYSBsb2NhbCB2YWx1ZSBpc1xuLy8gc2VyaWFsaXphYmxlIGFuZCBzaG91bGQgYmUgaW1tZWRpYXRlbHkgZGlzcGF0Y2hlZCB0byBhIHJlbW90ZSB1cG9uIHJlcXVlc3QsXG4vLyBpbnN0ZWFkIG9mIHBhc3NpbmcgYSByZWZlcmVuY2UuXG5RLnBhc3NCeUNvcHkgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgLy9mcmVlemUob2JqZWN0KTtcbiAgICAvL3Bhc3NCeUNvcGllcy5zZXQob2JqZWN0LCB0cnVlKTtcbiAgICByZXR1cm4gb2JqZWN0O1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUucGFzc0J5Q29weSA9IGZ1bmN0aW9uICgpIHtcbiAgICAvL2ZyZWV6ZShvYmplY3QpO1xuICAgIC8vcGFzc0J5Q29waWVzLnNldChvYmplY3QsIHRydWUpO1xuICAgIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBJZiB0d28gcHJvbWlzZXMgZXZlbnR1YWxseSBmdWxmaWxsIHRvIHRoZSBzYW1lIHZhbHVlLCBwcm9taXNlcyB0aGF0IHZhbHVlLFxuICogYnV0IG90aGVyd2lzZSByZWplY3RzLlxuICogQHBhcmFtIHgge0FueSp9XG4gKiBAcGFyYW0geSB7QW55Kn1cbiAqIEByZXR1cm5zIHtBbnkqfSBhIHByb21pc2UgZm9yIHggYW5kIHkgaWYgdGhleSBhcmUgdGhlIHNhbWUsIGJ1dCBhIHJlamVjdGlvblxuICogb3RoZXJ3aXNlLlxuICpcbiAqL1xuUS5qb2luID0gZnVuY3Rpb24gKHgsIHkpIHtcbiAgICByZXR1cm4gUSh4KS5qb2luKHkpO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuam9pbiA9IGZ1bmN0aW9uICh0aGF0KSB7XG4gICAgcmV0dXJuIFEoW3RoaXMsIHRoYXRdKS5zcHJlYWQoZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgaWYgKHggPT09IHkpIHtcbiAgICAgICAgICAgIC8vIFRPRE86IFwiPT09XCIgc2hvdWxkIGJlIE9iamVjdC5pcyBvciBlcXVpdlxuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBqb2luOiBub3QgdGhlIHNhbWU6IFwiICsgeCArIFwiIFwiICsgeSk7XG4gICAgICAgIH1cbiAgICB9KTtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSBmaXJzdCBvZiBhbiBhcnJheSBvZiBwcm9taXNlcyB0byBiZWNvbWUgZnVsZmlsbGVkLlxuICogQHBhcmFtIGFuc3dlcnMge0FycmF5W0FueSpdfSBwcm9taXNlcyB0byByYWNlXG4gKiBAcmV0dXJucyB7QW55Kn0gdGhlIGZpcnN0IHByb21pc2UgdG8gYmUgZnVsZmlsbGVkXG4gKi9cblEucmFjZSA9IHJhY2U7XG5mdW5jdGlvbiByYWNlKGFuc3dlclBzKSB7XG4gICAgcmV0dXJuIHByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgIC8vIFN3aXRjaCB0byB0aGlzIG9uY2Ugd2UgY2FuIGFzc3VtZSBhdCBsZWFzdCBFUzVcbiAgICAgICAgLy8gYW5zd2VyUHMuZm9yRWFjaChmdW5jdGlvbihhbnN3ZXJQKSB7XG4gICAgICAgIC8vICAgICBRKGFuc3dlclApLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcbiAgICAgICAgLy8gfSk7XG4gICAgICAgIC8vIFVzZSB0aGlzIGluIHRoZSBtZWFudGltZVxuICAgICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYW5zd2VyUHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIFEoYW5zd2VyUHNbaV0pLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS5yYWNlID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLnRoZW4oUS5yYWNlKTtcbn07XG5cbi8qKlxuICogQ29uc3RydWN0cyBhIFByb21pc2Ugd2l0aCBhIHByb21pc2UgZGVzY3JpcHRvciBvYmplY3QgYW5kIG9wdGlvbmFsIGZhbGxiYWNrXG4gKiBmdW5jdGlvbi4gIFRoZSBkZXNjcmlwdG9yIGNvbnRhaW5zIG1ldGhvZHMgbGlrZSB3aGVuKHJlamVjdGVkKSwgZ2V0KG5hbWUpLFxuICogc2V0KG5hbWUsIHZhbHVlKSwgcG9zdChuYW1lLCBhcmdzKSwgYW5kIGRlbGV0ZShuYW1lKSwgd2hpY2ggYWxsXG4gKiByZXR1cm4gZWl0aGVyIGEgdmFsdWUsIGEgcHJvbWlzZSBmb3IgYSB2YWx1ZSwgb3IgYSByZWplY3Rpb24uICBUaGUgZmFsbGJhY2tcbiAqIGFjY2VwdHMgdGhlIG9wZXJhdGlvbiBuYW1lLCBhIHJlc29sdmVyLCBhbmQgYW55IGZ1cnRoZXIgYXJndW1lbnRzIHRoYXQgd291bGRcbiAqIGhhdmUgYmVlbiBmb3J3YXJkZWQgdG8gdGhlIGFwcHJvcHJpYXRlIG1ldGhvZCBhYm92ZSBoYWQgYSBtZXRob2QgYmVlblxuICogcHJvdmlkZWQgd2l0aCB0aGUgcHJvcGVyIG5hbWUuICBUaGUgQVBJIG1ha2VzIG5vIGd1YXJhbnRlZXMgYWJvdXQgdGhlIG5hdHVyZVxuICogb2YgdGhlIHJldHVybmVkIG9iamVjdCwgYXBhcnQgZnJvbSB0aGF0IGl0IGlzIHVzYWJsZSB3aGVyZWV2ZXIgcHJvbWlzZXMgYXJlXG4gKiBib3VnaHQgYW5kIHNvbGQuXG4gKi9cblEubWFrZVByb21pc2UgPSBQcm9taXNlO1xuZnVuY3Rpb24gUHJvbWlzZShkZXNjcmlwdG9yLCBmYWxsYmFjaywgaW5zcGVjdCkge1xuICAgIGlmIChmYWxsYmFjayA9PT0gdm9pZCAwKSB7XG4gICAgICAgIGZhbGxiYWNrID0gZnVuY3Rpb24gKG9wKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVqZWN0KG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICBcIlByb21pc2UgZG9lcyBub3Qgc3VwcG9ydCBvcGVyYXRpb246IFwiICsgb3BcbiAgICAgICAgICAgICkpO1xuICAgICAgICB9O1xuICAgIH1cbiAgICBpZiAoaW5zcGVjdCA9PT0gdm9pZCAwKSB7XG4gICAgICAgIGluc3BlY3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4ge3N0YXRlOiBcInVua25vd25cIn07XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgdmFyIHByb21pc2UgPSBvYmplY3RfY3JlYXRlKFByb21pc2UucHJvdG90eXBlKTtcblxuICAgIHByb21pc2UucHJvbWlzZURpc3BhdGNoID0gZnVuY3Rpb24gKHJlc29sdmUsIG9wLCBhcmdzKSB7XG4gICAgICAgIHZhciByZXN1bHQ7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAoZGVzY3JpcHRvcltvcF0pIHtcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBkZXNjcmlwdG9yW29wXS5hcHBseShwcm9taXNlLCBhcmdzKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gZmFsbGJhY2suY2FsbChwcm9taXNlLCBvcCwgYXJncyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGV4Y2VwdGlvbikge1xuICAgICAgICAgICAgcmVzdWx0ID0gcmVqZWN0KGV4Y2VwdGlvbik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc29sdmUpIHtcbiAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBwcm9taXNlLmluc3BlY3QgPSBpbnNwZWN0O1xuXG4gICAgLy8gWFhYIGRlcHJlY2F0ZWQgYHZhbHVlT2ZgIGFuZCBgZXhjZXB0aW9uYCBzdXBwb3J0XG4gICAgaWYgKGluc3BlY3QpIHtcbiAgICAgICAgdmFyIGluc3BlY3RlZCA9IGluc3BlY3QoKTtcbiAgICAgICAgaWYgKGluc3BlY3RlZC5zdGF0ZSA9PT0gXCJyZWplY3RlZFwiKSB7XG4gICAgICAgICAgICBwcm9taXNlLmV4Y2VwdGlvbiA9IGluc3BlY3RlZC5yZWFzb247XG4gICAgICAgIH1cblxuICAgICAgICBwcm9taXNlLnZhbHVlT2YgPSBkZXByZWNhdGUoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGluc3BlY3RlZCA9IGluc3BlY3QoKTtcbiAgICAgICAgICAgIGlmIChpbnNwZWN0ZWQuc3RhdGUgPT09IFwicGVuZGluZ1wiIHx8XG4gICAgICAgICAgICAgICAgaW5zcGVjdGVkLnN0YXRlID09PSBcInJlamVjdGVkXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBpbnNwZWN0ZWQudmFsdWU7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBwcm9taXNlO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gXCJbb2JqZWN0IFByb21pc2VdXCI7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS50aGVuID0gZnVuY3Rpb24gKGZ1bGZpbGxlZCwgcmVqZWN0ZWQsIHByb2dyZXNzZWQpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICB2YXIgZG9uZSA9IGZhbHNlOyAgIC8vIGVuc3VyZSB0aGUgdW50cnVzdGVkIHByb21pc2UgbWFrZXMgYXQgbW9zdCBhXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzaW5nbGUgY2FsbCB0byBvbmUgb2YgdGhlIGNhbGxiYWNrc1xuXG4gICAgZnVuY3Rpb24gX2Z1bGZpbGxlZCh2YWx1ZSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiBmdWxmaWxsZWQgPT09IFwiZnVuY3Rpb25cIiA/IGZ1bGZpbGxlZCh2YWx1ZSkgOiB2YWx1ZTtcbiAgICAgICAgfSBjYXRjaCAoZXhjZXB0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVqZWN0KGV4Y2VwdGlvbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfcmVqZWN0ZWQoZXhjZXB0aW9uKSB7XG4gICAgICAgIGlmICh0eXBlb2YgcmVqZWN0ZWQgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgbWFrZVN0YWNrVHJhY2VMb25nKGV4Y2VwdGlvbiwgc2VsZik7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3RlZChleGNlcHRpb24pO1xuICAgICAgICAgICAgfSBjYXRjaCAobmV3RXhjZXB0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChuZXdFeGNlcHRpb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZWplY3QoZXhjZXB0aW9uKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfcHJvZ3Jlc3NlZCh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdHlwZW9mIHByb2dyZXNzZWQgPT09IFwiZnVuY3Rpb25cIiA/IHByb2dyZXNzZWQodmFsdWUpIDogdmFsdWU7XG4gICAgfVxuXG4gICAgbmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICBzZWxmLnByb21pc2VEaXNwYXRjaChmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgIGlmIChkb25lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZG9uZSA9IHRydWU7XG5cbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoX2Z1bGZpbGxlZCh2YWx1ZSkpO1xuICAgICAgICB9LCBcIndoZW5cIiwgW2Z1bmN0aW9uIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgIGlmIChkb25lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZG9uZSA9IHRydWU7XG5cbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoX3JlamVjdGVkKGV4Y2VwdGlvbikpO1xuICAgICAgICB9XSk7XG4gICAgfSk7XG5cbiAgICAvLyBQcm9ncmVzcyBwcm9wYWdhdG9yIG5lZWQgdG8gYmUgYXR0YWNoZWQgaW4gdGhlIGN1cnJlbnQgdGljay5cbiAgICBzZWxmLnByb21pc2VEaXNwYXRjaCh2b2lkIDAsIFwid2hlblwiLCBbdm9pZCAwLCBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgdmFyIG5ld1ZhbHVlO1xuICAgICAgICB2YXIgdGhyZXcgPSBmYWxzZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIG5ld1ZhbHVlID0gX3Byb2dyZXNzZWQodmFsdWUpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aHJldyA9IHRydWU7XG4gICAgICAgICAgICBpZiAoUS5vbmVycm9yKSB7XG4gICAgICAgICAgICAgICAgUS5vbmVycm9yKGUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aHJldykge1xuICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KG5ld1ZhbHVlKTtcbiAgICAgICAgfVxuICAgIH1dKTtcblxuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlcnMgYW4gb2JzZXJ2ZXIgb24gYSBwcm9taXNlLlxuICpcbiAqIEd1YXJhbnRlZXM6XG4gKlxuICogMS4gdGhhdCBmdWxmaWxsZWQgYW5kIHJlamVjdGVkIHdpbGwgYmUgY2FsbGVkIG9ubHkgb25jZS5cbiAqIDIuIHRoYXQgZWl0aGVyIHRoZSBmdWxmaWxsZWQgY2FsbGJhY2sgb3IgdGhlIHJlamVjdGVkIGNhbGxiYWNrIHdpbGwgYmVcbiAqICAgIGNhbGxlZCwgYnV0IG5vdCBib3RoLlxuICogMy4gdGhhdCBmdWxmaWxsZWQgYW5kIHJlamVjdGVkIHdpbGwgbm90IGJlIGNhbGxlZCBpbiB0aGlzIHR1cm4uXG4gKlxuICogQHBhcmFtIHZhbHVlICAgICAgcHJvbWlzZSBvciBpbW1lZGlhdGUgcmVmZXJlbmNlIHRvIG9ic2VydmVcbiAqIEBwYXJhbSBmdWxmaWxsZWQgIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCB3aXRoIHRoZSBmdWxmaWxsZWQgdmFsdWVcbiAqIEBwYXJhbSByZWplY3RlZCAgIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCB3aXRoIHRoZSByZWplY3Rpb24gZXhjZXB0aW9uXG4gKiBAcGFyYW0gcHJvZ3Jlc3NlZCBmdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gYW55IHByb2dyZXNzIG5vdGlmaWNhdGlvbnNcbiAqIEByZXR1cm4gcHJvbWlzZSBmb3IgdGhlIHJldHVybiB2YWx1ZSBmcm9tIHRoZSBpbnZva2VkIGNhbGxiYWNrXG4gKi9cblEud2hlbiA9IHdoZW47XG5mdW5jdGlvbiB3aGVuKHZhbHVlLCBmdWxmaWxsZWQsIHJlamVjdGVkLCBwcm9ncmVzc2VkKSB7XG4gICAgcmV0dXJuIFEodmFsdWUpLnRoZW4oZnVsZmlsbGVkLCByZWplY3RlZCwgcHJvZ3Jlc3NlZCk7XG59XG5cblByb21pc2UucHJvdG90eXBlLnRoZW5SZXNvbHZlID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIHRoaXMudGhlbihmdW5jdGlvbiAoKSB7IHJldHVybiB2YWx1ZTsgfSk7XG59O1xuXG5RLnRoZW5SZXNvbHZlID0gZnVuY3Rpb24gKHByb21pc2UsIHZhbHVlKSB7XG4gICAgcmV0dXJuIFEocHJvbWlzZSkudGhlblJlc29sdmUodmFsdWUpO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUudGhlblJlamVjdCA9IGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKGZ1bmN0aW9uICgpIHsgdGhyb3cgcmVhc29uOyB9KTtcbn07XG5cblEudGhlblJlamVjdCA9IGZ1bmN0aW9uIChwcm9taXNlLCByZWFzb24pIHtcbiAgICByZXR1cm4gUShwcm9taXNlKS50aGVuUmVqZWN0KHJlYXNvbik7XG59O1xuXG4vKipcbiAqIElmIGFuIG9iamVjdCBpcyBub3QgYSBwcm9taXNlLCBpdCBpcyBhcyBcIm5lYXJcIiBhcyBwb3NzaWJsZS5cbiAqIElmIGEgcHJvbWlzZSBpcyByZWplY3RlZCwgaXQgaXMgYXMgXCJuZWFyXCIgYXMgcG9zc2libGUgdG9vLlxuICogSWYgaXTigJlzIGEgZnVsZmlsbGVkIHByb21pc2UsIHRoZSBmdWxmaWxsbWVudCB2YWx1ZSBpcyBuZWFyZXIuXG4gKiBJZiBpdOKAmXMgYSBkZWZlcnJlZCBwcm9taXNlIGFuZCB0aGUgZGVmZXJyZWQgaGFzIGJlZW4gcmVzb2x2ZWQsIHRoZVxuICogcmVzb2x1dGlvbiBpcyBcIm5lYXJlclwiLlxuICogQHBhcmFtIG9iamVjdFxuICogQHJldHVybnMgbW9zdCByZXNvbHZlZCAobmVhcmVzdCkgZm9ybSBvZiB0aGUgb2JqZWN0XG4gKi9cblxuLy8gWFhYIHNob3VsZCB3ZSByZS1kbyB0aGlzP1xuUS5uZWFyZXIgPSBuZWFyZXI7XG5mdW5jdGlvbiBuZWFyZXIodmFsdWUpIHtcbiAgICBpZiAoaXNQcm9taXNlKHZhbHVlKSkge1xuICAgICAgICB2YXIgaW5zcGVjdGVkID0gdmFsdWUuaW5zcGVjdCgpO1xuICAgICAgICBpZiAoaW5zcGVjdGVkLnN0YXRlID09PSBcImZ1bGZpbGxlZFwiKSB7XG4gICAgICAgICAgICByZXR1cm4gaW5zcGVjdGVkLnZhbHVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn1cblxuLyoqXG4gKiBAcmV0dXJucyB3aGV0aGVyIHRoZSBnaXZlbiBvYmplY3QgaXMgYSBwcm9taXNlLlxuICogT3RoZXJ3aXNlIGl0IGlzIGEgZnVsZmlsbGVkIHZhbHVlLlxuICovXG5RLmlzUHJvbWlzZSA9IGlzUHJvbWlzZTtcbmZ1bmN0aW9uIGlzUHJvbWlzZShvYmplY3QpIHtcbiAgICByZXR1cm4gaXNPYmplY3Qob2JqZWN0KSAmJlxuICAgICAgICB0eXBlb2Ygb2JqZWN0LnByb21pc2VEaXNwYXRjaCA9PT0gXCJmdW5jdGlvblwiICYmXG4gICAgICAgIHR5cGVvZiBvYmplY3QuaW5zcGVjdCA9PT0gXCJmdW5jdGlvblwiO1xufVxuXG5RLmlzUHJvbWlzZUFsaWtlID0gaXNQcm9taXNlQWxpa2U7XG5mdW5jdGlvbiBpc1Byb21pc2VBbGlrZShvYmplY3QpIHtcbiAgICByZXR1cm4gaXNPYmplY3Qob2JqZWN0KSAmJiB0eXBlb2Ygb2JqZWN0LnRoZW4gPT09IFwiZnVuY3Rpb25cIjtcbn1cblxuLyoqXG4gKiBAcmV0dXJucyB3aGV0aGVyIHRoZSBnaXZlbiBvYmplY3QgaXMgYSBwZW5kaW5nIHByb21pc2UsIG1lYW5pbmcgbm90XG4gKiBmdWxmaWxsZWQgb3IgcmVqZWN0ZWQuXG4gKi9cblEuaXNQZW5kaW5nID0gaXNQZW5kaW5nO1xuZnVuY3Rpb24gaXNQZW5kaW5nKG9iamVjdCkge1xuICAgIHJldHVybiBpc1Byb21pc2Uob2JqZWN0KSAmJiBvYmplY3QuaW5zcGVjdCgpLnN0YXRlID09PSBcInBlbmRpbmdcIjtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUuaXNQZW5kaW5nID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmluc3BlY3QoKS5zdGF0ZSA9PT0gXCJwZW5kaW5nXCI7XG59O1xuXG4vKipcbiAqIEByZXR1cm5zIHdoZXRoZXIgdGhlIGdpdmVuIG9iamVjdCBpcyBhIHZhbHVlIG9yIGZ1bGZpbGxlZFxuICogcHJvbWlzZS5cbiAqL1xuUS5pc0Z1bGZpbGxlZCA9IGlzRnVsZmlsbGVkO1xuZnVuY3Rpb24gaXNGdWxmaWxsZWQob2JqZWN0KSB7XG4gICAgcmV0dXJuICFpc1Byb21pc2Uob2JqZWN0KSB8fCBvYmplY3QuaW5zcGVjdCgpLnN0YXRlID09PSBcImZ1bGZpbGxlZFwiO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS5pc0Z1bGZpbGxlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5pbnNwZWN0KCkuc3RhdGUgPT09IFwiZnVsZmlsbGVkXCI7XG59O1xuXG4vKipcbiAqIEByZXR1cm5zIHdoZXRoZXIgdGhlIGdpdmVuIG9iamVjdCBpcyBhIHJlamVjdGVkIHByb21pc2UuXG4gKi9cblEuaXNSZWplY3RlZCA9IGlzUmVqZWN0ZWQ7XG5mdW5jdGlvbiBpc1JlamVjdGVkKG9iamVjdCkge1xuICAgIHJldHVybiBpc1Byb21pc2Uob2JqZWN0KSAmJiBvYmplY3QuaW5zcGVjdCgpLnN0YXRlID09PSBcInJlamVjdGVkXCI7XG59XG5cblByb21pc2UucHJvdG90eXBlLmlzUmVqZWN0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuaW5zcGVjdCgpLnN0YXRlID09PSBcInJlamVjdGVkXCI7XG59O1xuXG4vLy8vIEJFR0lOIFVOSEFORExFRCBSRUpFQ1RJT04gVFJBQ0tJTkdcblxuLy8gVGhpcyBwcm9taXNlIGxpYnJhcnkgY29uc3VtZXMgZXhjZXB0aW9ucyB0aHJvd24gaW4gaGFuZGxlcnMgc28gdGhleSBjYW4gYmVcbi8vIGhhbmRsZWQgYnkgYSBzdWJzZXF1ZW50IHByb21pc2UuICBUaGUgZXhjZXB0aW9ucyBnZXQgYWRkZWQgdG8gdGhpcyBhcnJheSB3aGVuXG4vLyB0aGV5IGFyZSBjcmVhdGVkLCBhbmQgcmVtb3ZlZCB3aGVuIHRoZXkgYXJlIGhhbmRsZWQuICBOb3RlIHRoYXQgaW4gRVM2IG9yXG4vLyBzaGltbWVkIGVudmlyb25tZW50cywgdGhpcyB3b3VsZCBuYXR1cmFsbHkgYmUgYSBgU2V0YC5cbnZhciB1bmhhbmRsZWRSZWFzb25zID0gW107XG52YXIgdW5oYW5kbGVkUmVqZWN0aW9ucyA9IFtdO1xudmFyIHVuaGFuZGxlZFJlYXNvbnNEaXNwbGF5ZWQgPSBmYWxzZTtcbnZhciB0cmFja1VuaGFuZGxlZFJlamVjdGlvbnMgPSB0cnVlO1xuZnVuY3Rpb24gZGlzcGxheVVuaGFuZGxlZFJlYXNvbnMoKSB7XG4gICAgaWYgKFxuICAgICAgICAhdW5oYW5kbGVkUmVhc29uc0Rpc3BsYXllZCAmJlxuICAgICAgICB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiICYmXG4gICAgICAgICF3aW5kb3cuVG91Y2ggJiZcbiAgICAgICAgd2luZG93LmNvbnNvbGVcbiAgICApIHtcbiAgICAgICAgY29uc29sZS53YXJuKFwiW1FdIFVuaGFuZGxlZCByZWplY3Rpb24gcmVhc29ucyAoc2hvdWxkIGJlIGVtcHR5KTpcIixcbiAgICAgICAgICAgICAgICAgICAgIHVuaGFuZGxlZFJlYXNvbnMpO1xuICAgIH1cblxuICAgIHVuaGFuZGxlZFJlYXNvbnNEaXNwbGF5ZWQgPSB0cnVlO1xufVxuXG5mdW5jdGlvbiBsb2dVbmhhbmRsZWRSZWFzb25zKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdW5oYW5kbGVkUmVhc29ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcmVhc29uID0gdW5oYW5kbGVkUmVhc29uc1tpXTtcbiAgICAgICAgY29uc29sZS53YXJuKFwiVW5oYW5kbGVkIHJlamVjdGlvbiByZWFzb246XCIsIHJlYXNvbik7XG4gICAgfVxufVxuXG5mdW5jdGlvbiByZXNldFVuaGFuZGxlZFJlamVjdGlvbnMoKSB7XG4gICAgdW5oYW5kbGVkUmVhc29ucy5sZW5ndGggPSAwO1xuICAgIHVuaGFuZGxlZFJlamVjdGlvbnMubGVuZ3RoID0gMDtcbiAgICB1bmhhbmRsZWRSZWFzb25zRGlzcGxheWVkID0gZmFsc2U7XG5cbiAgICBpZiAoIXRyYWNrVW5oYW5kbGVkUmVqZWN0aW9ucykge1xuICAgICAgICB0cmFja1VuaGFuZGxlZFJlamVjdGlvbnMgPSB0cnVlO1xuXG4gICAgICAgIC8vIFNob3cgdW5oYW5kbGVkIHJlamVjdGlvbiByZWFzb25zIGlmIE5vZGUgZXhpdHMgd2l0aG91dCBoYW5kbGluZyBhblxuICAgICAgICAvLyBvdXRzdGFuZGluZyByZWplY3Rpb24uICAoTm90ZSB0aGF0IEJyb3dzZXJpZnkgcHJlc2VudGx5IHByb2R1Y2VzIGFcbiAgICAgICAgLy8gYHByb2Nlc3NgIGdsb2JhbCB3aXRob3V0IHRoZSBgRXZlbnRFbWl0dGVyYCBgb25gIG1ldGhvZC4pXG4gICAgICAgIGlmICh0eXBlb2YgcHJvY2VzcyAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwcm9jZXNzLm9uKSB7XG4gICAgICAgICAgICBwcm9jZXNzLm9uKFwiZXhpdFwiLCBsb2dVbmhhbmRsZWRSZWFzb25zKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gdHJhY2tSZWplY3Rpb24ocHJvbWlzZSwgcmVhc29uKSB7XG4gICAgaWYgKCF0cmFja1VuaGFuZGxlZFJlamVjdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHVuaGFuZGxlZFJlamVjdGlvbnMucHVzaChwcm9taXNlKTtcbiAgICBpZiAocmVhc29uICYmIHR5cGVvZiByZWFzb24uc3RhY2sgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgdW5oYW5kbGVkUmVhc29ucy5wdXNoKHJlYXNvbi5zdGFjayk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdW5oYW5kbGVkUmVhc29ucy5wdXNoKFwiKG5vIHN0YWNrKSBcIiArIHJlYXNvbik7XG4gICAgfVxuICAgIGRpc3BsYXlVbmhhbmRsZWRSZWFzb25zKCk7XG59XG5cbmZ1bmN0aW9uIHVudHJhY2tSZWplY3Rpb24ocHJvbWlzZSkge1xuICAgIGlmICghdHJhY2tVbmhhbmRsZWRSZWplY3Rpb25zKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgYXQgPSBhcnJheV9pbmRleE9mKHVuaGFuZGxlZFJlamVjdGlvbnMsIHByb21pc2UpO1xuICAgIGlmIChhdCAhPT0gLTEpIHtcbiAgICAgICAgdW5oYW5kbGVkUmVqZWN0aW9ucy5zcGxpY2UoYXQsIDEpO1xuICAgICAgICB1bmhhbmRsZWRSZWFzb25zLnNwbGljZShhdCwgMSk7XG4gICAgfVxufVxuXG5RLnJlc2V0VW5oYW5kbGVkUmVqZWN0aW9ucyA9IHJlc2V0VW5oYW5kbGVkUmVqZWN0aW9ucztcblxuUS5nZXRVbmhhbmRsZWRSZWFzb25zID0gZnVuY3Rpb24gKCkge1xuICAgIC8vIE1ha2UgYSBjb3B5IHNvIHRoYXQgY29uc3VtZXJzIGNhbid0IGludGVyZmVyZSB3aXRoIG91ciBpbnRlcm5hbCBzdGF0ZS5cbiAgICByZXR1cm4gdW5oYW5kbGVkUmVhc29ucy5zbGljZSgpO1xufTtcblxuUS5zdG9wVW5oYW5kbGVkUmVqZWN0aW9uVHJhY2tpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmVzZXRVbmhhbmRsZWRSZWplY3Rpb25zKCk7XG4gICAgaWYgKHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIHByb2Nlc3Mub24pIHtcbiAgICAgICAgcHJvY2Vzcy5yZW1vdmVMaXN0ZW5lcihcImV4aXRcIiwgbG9nVW5oYW5kbGVkUmVhc29ucyk7XG4gICAgfVxuICAgIHRyYWNrVW5oYW5kbGVkUmVqZWN0aW9ucyA9IGZhbHNlO1xufTtcblxucmVzZXRVbmhhbmRsZWRSZWplY3Rpb25zKCk7XG5cbi8vLy8gRU5EIFVOSEFORExFRCBSRUpFQ1RJT04gVFJBQ0tJTkdcblxuLyoqXG4gKiBDb25zdHJ1Y3RzIGEgcmVqZWN0ZWQgcHJvbWlzZS5cbiAqIEBwYXJhbSByZWFzb24gdmFsdWUgZGVzY3JpYmluZyB0aGUgZmFpbHVyZVxuICovXG5RLnJlamVjdCA9IHJlamVjdDtcbmZ1bmN0aW9uIHJlamVjdChyZWFzb24pIHtcbiAgICB2YXIgcmVqZWN0aW9uID0gUHJvbWlzZSh7XG4gICAgICAgIFwid2hlblwiOiBmdW5jdGlvbiAocmVqZWN0ZWQpIHtcbiAgICAgICAgICAgIC8vIG5vdGUgdGhhdCB0aGUgZXJyb3IgaGFzIGJlZW4gaGFuZGxlZFxuICAgICAgICAgICAgaWYgKHJlamVjdGVkKSB7XG4gICAgICAgICAgICAgICAgdW50cmFja1JlamVjdGlvbih0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZWplY3RlZCA/IHJlamVjdGVkKHJlYXNvbikgOiB0aGlzO1xuICAgICAgICB9XG4gICAgfSwgZnVuY3Rpb24gZmFsbGJhY2soKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sIGZ1bmN0aW9uIGluc3BlY3QoKSB7XG4gICAgICAgIHJldHVybiB7IHN0YXRlOiBcInJlamVjdGVkXCIsIHJlYXNvbjogcmVhc29uIH07XG4gICAgfSk7XG5cbiAgICAvLyBOb3RlIHRoYXQgdGhlIHJlYXNvbiBoYXMgbm90IGJlZW4gaGFuZGxlZC5cbiAgICB0cmFja1JlamVjdGlvbihyZWplY3Rpb24sIHJlYXNvbik7XG5cbiAgICByZXR1cm4gcmVqZWN0aW9uO1xufVxuXG4vKipcbiAqIENvbnN0cnVjdHMgYSBmdWxmaWxsZWQgcHJvbWlzZSBmb3IgYW4gaW1tZWRpYXRlIHJlZmVyZW5jZS5cbiAqIEBwYXJhbSB2YWx1ZSBpbW1lZGlhdGUgcmVmZXJlbmNlXG4gKi9cblEuZnVsZmlsbCA9IGZ1bGZpbGw7XG5mdW5jdGlvbiBmdWxmaWxsKHZhbHVlKSB7XG4gICAgcmV0dXJuIFByb21pc2Uoe1xuICAgICAgICBcIndoZW5cIjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9LFxuICAgICAgICBcImdldFwiOiBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlW25hbWVdO1xuICAgICAgICB9LFxuICAgICAgICBcInNldFwiOiBmdW5jdGlvbiAobmFtZSwgcmhzKSB7XG4gICAgICAgICAgICB2YWx1ZVtuYW1lXSA9IHJocztcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWxldGVcIjogZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB2YWx1ZVtuYW1lXTtcbiAgICAgICAgfSxcbiAgICAgICAgXCJwb3N0XCI6IGZ1bmN0aW9uIChuYW1lLCBhcmdzKSB7XG4gICAgICAgICAgICAvLyBNYXJrIE1pbGxlciBwcm9wb3NlcyB0aGF0IHBvc3Qgd2l0aCBubyBuYW1lIHNob3VsZCBhcHBseSBhXG4gICAgICAgICAgICAvLyBwcm9taXNlZCBmdW5jdGlvbi5cbiAgICAgICAgICAgIGlmIChuYW1lID09PSBudWxsIHx8IG5hbWUgPT09IHZvaWQgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5hcHBseSh2b2lkIDAsIGFyZ3MpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWVbbmFtZV0uYXBwbHkodmFsdWUsIGFyZ3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImFwcGx5XCI6IGZ1bmN0aW9uICh0aGlzcCwgYXJncykge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLmFwcGx5KHRoaXNwLCBhcmdzKTtcbiAgICAgICAgfSxcbiAgICAgICAgXCJrZXlzXCI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBvYmplY3Rfa2V5cyh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9LCB2b2lkIDAsIGZ1bmN0aW9uIGluc3BlY3QoKSB7XG4gICAgICAgIHJldHVybiB7IHN0YXRlOiBcImZ1bGZpbGxlZFwiLCB2YWx1ZTogdmFsdWUgfTtcbiAgICB9KTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyB0aGVuYWJsZXMgdG8gUSBwcm9taXNlcy5cbiAqIEBwYXJhbSBwcm9taXNlIHRoZW5hYmxlIHByb21pc2VcbiAqIEByZXR1cm5zIGEgUSBwcm9taXNlXG4gKi9cbmZ1bmN0aW9uIGNvZXJjZShwcm9taXNlKSB7XG4gICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICBuZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBwcm9taXNlLnRoZW4oZGVmZXJyZWQucmVzb2x2ZSwgZGVmZXJyZWQucmVqZWN0LCBkZWZlcnJlZC5ub3RpZnkpO1xuICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChleGNlcHRpb24pO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG59XG5cbi8qKlxuICogQW5ub3RhdGVzIGFuIG9iamVjdCBzdWNoIHRoYXQgaXQgd2lsbCBuZXZlciBiZVxuICogdHJhbnNmZXJyZWQgYXdheSBmcm9tIHRoaXMgcHJvY2VzcyBvdmVyIGFueSBwcm9taXNlXG4gKiBjb21tdW5pY2F0aW9uIGNoYW5uZWwuXG4gKiBAcGFyYW0gb2JqZWN0XG4gKiBAcmV0dXJucyBwcm9taXNlIGEgd3JhcHBpbmcgb2YgdGhhdCBvYmplY3QgdGhhdFxuICogYWRkaXRpb25hbGx5IHJlc3BvbmRzIHRvIHRoZSBcImlzRGVmXCIgbWVzc2FnZVxuICogd2l0aG91dCBhIHJlamVjdGlvbi5cbiAqL1xuUS5tYXN0ZXIgPSBtYXN0ZXI7XG5mdW5jdGlvbiBtYXN0ZXIob2JqZWN0KSB7XG4gICAgcmV0dXJuIFByb21pc2Uoe1xuICAgICAgICBcImlzRGVmXCI6IGZ1bmN0aW9uICgpIHt9XG4gICAgfSwgZnVuY3Rpb24gZmFsbGJhY2sob3AsIGFyZ3MpIHtcbiAgICAgICAgcmV0dXJuIGRpc3BhdGNoKG9iamVjdCwgb3AsIGFyZ3MpO1xuICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFEob2JqZWN0KS5pbnNwZWN0KCk7XG4gICAgfSk7XG59XG5cbi8qKlxuICogU3ByZWFkcyB0aGUgdmFsdWVzIG9mIGEgcHJvbWlzZWQgYXJyYXkgb2YgYXJndW1lbnRzIGludG8gdGhlXG4gKiBmdWxmaWxsbWVudCBjYWxsYmFjay5cbiAqIEBwYXJhbSBmdWxmaWxsZWQgY2FsbGJhY2sgdGhhdCByZWNlaXZlcyB2YXJpYWRpYyBhcmd1bWVudHMgZnJvbSB0aGVcbiAqIHByb21pc2VkIGFycmF5XG4gKiBAcGFyYW0gcmVqZWN0ZWQgY2FsbGJhY2sgdGhhdCByZWNlaXZlcyB0aGUgZXhjZXB0aW9uIGlmIHRoZSBwcm9taXNlXG4gKiBpcyByZWplY3RlZC5cbiAqIEByZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHJldHVybiB2YWx1ZSBvciB0aHJvd24gZXhjZXB0aW9uIG9mXG4gKiBlaXRoZXIgY2FsbGJhY2suXG4gKi9cblEuc3ByZWFkID0gc3ByZWFkO1xuZnVuY3Rpb24gc3ByZWFkKHZhbHVlLCBmdWxmaWxsZWQsIHJlamVjdGVkKSB7XG4gICAgcmV0dXJuIFEodmFsdWUpLnNwcmVhZChmdWxmaWxsZWQsIHJlamVjdGVkKTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUuc3ByZWFkID0gZnVuY3Rpb24gKGZ1bGZpbGxlZCwgcmVqZWN0ZWQpIHtcbiAgICByZXR1cm4gdGhpcy5hbGwoKS50aGVuKGZ1bmN0aW9uIChhcnJheSkge1xuICAgICAgICByZXR1cm4gZnVsZmlsbGVkLmFwcGx5KHZvaWQgMCwgYXJyYXkpO1xuICAgIH0sIHJlamVjdGVkKTtcbn07XG5cbi8qKlxuICogVGhlIGFzeW5jIGZ1bmN0aW9uIGlzIGEgZGVjb3JhdG9yIGZvciBnZW5lcmF0b3IgZnVuY3Rpb25zLCB0dXJuaW5nXG4gKiB0aGVtIGludG8gYXN5bmNocm9ub3VzIGdlbmVyYXRvcnMuICBBbHRob3VnaCBnZW5lcmF0b3JzIGFyZSBvbmx5IHBhcnRcbiAqIG9mIHRoZSBuZXdlc3QgRUNNQVNjcmlwdCA2IGRyYWZ0cywgdGhpcyBjb2RlIGRvZXMgbm90IGNhdXNlIHN5bnRheFxuICogZXJyb3JzIGluIG9sZGVyIGVuZ2luZXMuICBUaGlzIGNvZGUgc2hvdWxkIGNvbnRpbnVlIHRvIHdvcmsgYW5kIHdpbGxcbiAqIGluIGZhY3QgaW1wcm92ZSBvdmVyIHRpbWUgYXMgdGhlIGxhbmd1YWdlIGltcHJvdmVzLlxuICpcbiAqIEVTNiBnZW5lcmF0b3JzIGFyZSBjdXJyZW50bHkgcGFydCBvZiBWOCB2ZXJzaW9uIDMuMTkgd2l0aCB0aGVcbiAqIC0taGFybW9ueS1nZW5lcmF0b3JzIHJ1bnRpbWUgZmxhZyBlbmFibGVkLiAgU3BpZGVyTW9ua2V5IGhhcyBoYWQgdGhlbVxuICogZm9yIGxvbmdlciwgYnV0IHVuZGVyIGFuIG9sZGVyIFB5dGhvbi1pbnNwaXJlZCBmb3JtLiAgVGhpcyBmdW5jdGlvblxuICogd29ya3Mgb24gYm90aCBraW5kcyBvZiBnZW5lcmF0b3JzLlxuICpcbiAqIERlY29yYXRlcyBhIGdlbmVyYXRvciBmdW5jdGlvbiBzdWNoIHRoYXQ6XG4gKiAgLSBpdCBtYXkgeWllbGQgcHJvbWlzZXNcbiAqICAtIGV4ZWN1dGlvbiB3aWxsIGNvbnRpbnVlIHdoZW4gdGhhdCBwcm9taXNlIGlzIGZ1bGZpbGxlZFxuICogIC0gdGhlIHZhbHVlIG9mIHRoZSB5aWVsZCBleHByZXNzaW9uIHdpbGwgYmUgdGhlIGZ1bGZpbGxlZCB2YWx1ZVxuICogIC0gaXQgcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWUgKHdoZW4gdGhlIGdlbmVyYXRvclxuICogICAgc3RvcHMgaXRlcmF0aW5nKVxuICogIC0gdGhlIGRlY29yYXRlZCBmdW5jdGlvbiByZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHJldHVybiB2YWx1ZVxuICogICAgb2YgdGhlIGdlbmVyYXRvciBvciB0aGUgZmlyc3QgcmVqZWN0ZWQgcHJvbWlzZSBhbW9uZyB0aG9zZVxuICogICAgeWllbGRlZC5cbiAqICAtIGlmIGFuIGVycm9yIGlzIHRocm93biBpbiB0aGUgZ2VuZXJhdG9yLCBpdCBwcm9wYWdhdGVzIHRocm91Z2hcbiAqICAgIGV2ZXJ5IGZvbGxvd2luZyB5aWVsZCB1bnRpbCBpdCBpcyBjYXVnaHQsIG9yIHVudGlsIGl0IGVzY2FwZXNcbiAqICAgIHRoZSBnZW5lcmF0b3IgZnVuY3Rpb24gYWx0b2dldGhlciwgYW5kIGlzIHRyYW5zbGF0ZWQgaW50byBhXG4gKiAgICByZWplY3Rpb24gZm9yIHRoZSBwcm9taXNlIHJldHVybmVkIGJ5IHRoZSBkZWNvcmF0ZWQgZ2VuZXJhdG9yLlxuICovXG5RLmFzeW5jID0gYXN5bmM7XG5mdW5jdGlvbiBhc3luYyhtYWtlR2VuZXJhdG9yKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gd2hlbiB2ZXJiIGlzIFwic2VuZFwiLCBhcmcgaXMgYSB2YWx1ZVxuICAgICAgICAvLyB3aGVuIHZlcmIgaXMgXCJ0aHJvd1wiLCBhcmcgaXMgYW4gZXhjZXB0aW9uXG4gICAgICAgIGZ1bmN0aW9uIGNvbnRpbnVlcih2ZXJiLCBhcmcpIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQ7XG4gICAgICAgICAgICBpZiAoaGFzRVM2R2VuZXJhdG9ycykge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IGdlbmVyYXRvclt2ZXJiXShhcmcpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGV4Y2VwdGlvbikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGV4Y2VwdGlvbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuZG9uZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0LnZhbHVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB3aGVuKHJlc3VsdC52YWx1ZSwgY2FsbGJhY2ssIGVycmJhY2spO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gRklYTUU6IFJlbW92ZSB0aGlzIGNhc2Ugd2hlbiBTTSBkb2VzIEVTNiBnZW5lcmF0b3JzLlxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IGdlbmVyYXRvclt2ZXJiXShhcmcpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGV4Y2VwdGlvbikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXNTdG9wSXRlcmF0aW9uKGV4Y2VwdGlvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBleGNlcHRpb24udmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGV4Y2VwdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHdoZW4ocmVzdWx0LCBjYWxsYmFjaywgZXJyYmFjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGdlbmVyYXRvciA9IG1ha2VHZW5lcmF0b3IuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gY29udGludWVyLmJpbmQoY29udGludWVyLCBcIm5leHRcIik7XG4gICAgICAgIHZhciBlcnJiYWNrID0gY29udGludWVyLmJpbmQoY29udGludWVyLCBcInRocm93XCIpO1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICB9O1xufVxuXG4vKipcbiAqIFRoZSBzcGF3biBmdW5jdGlvbiBpcyBhIHNtYWxsIHdyYXBwZXIgYXJvdW5kIGFzeW5jIHRoYXQgaW1tZWRpYXRlbHlcbiAqIGNhbGxzIHRoZSBnZW5lcmF0b3IgYW5kIGFsc28gZW5kcyB0aGUgcHJvbWlzZSBjaGFpbiwgc28gdGhhdCBhbnlcbiAqIHVuaGFuZGxlZCBlcnJvcnMgYXJlIHRocm93biBpbnN0ZWFkIG9mIGZvcndhcmRlZCB0byB0aGUgZXJyb3JcbiAqIGhhbmRsZXIuIFRoaXMgaXMgdXNlZnVsIGJlY2F1c2UgaXQncyBleHRyZW1lbHkgY29tbW9uIHRvIHJ1blxuICogZ2VuZXJhdG9ycyBhdCB0aGUgdG9wLWxldmVsIHRvIHdvcmsgd2l0aCBsaWJyYXJpZXMuXG4gKi9cblEuc3Bhd24gPSBzcGF3bjtcbmZ1bmN0aW9uIHNwYXduKG1ha2VHZW5lcmF0b3IpIHtcbiAgICBRLmRvbmUoUS5hc3luYyhtYWtlR2VuZXJhdG9yKSgpKTtcbn1cblxuLy8gRklYTUU6IFJlbW92ZSB0aGlzIGludGVyZmFjZSBvbmNlIEVTNiBnZW5lcmF0b3JzIGFyZSBpbiBTcGlkZXJNb25rZXkuXG4vKipcbiAqIFRocm93cyBhIFJldHVyblZhbHVlIGV4Y2VwdGlvbiB0byBzdG9wIGFuIGFzeW5jaHJvbm91cyBnZW5lcmF0b3IuXG4gKlxuICogVGhpcyBpbnRlcmZhY2UgaXMgYSBzdG9wLWdhcCBtZWFzdXJlIHRvIHN1cHBvcnQgZ2VuZXJhdG9yIHJldHVyblxuICogdmFsdWVzIGluIG9sZGVyIEZpcmVmb3gvU3BpZGVyTW9ua2V5LiAgSW4gYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEVTNlxuICogZ2VuZXJhdG9ycyBsaWtlIENocm9taXVtIDI5LCBqdXN0IHVzZSBcInJldHVyblwiIGluIHlvdXIgZ2VuZXJhdG9yXG4gKiBmdW5jdGlvbnMuXG4gKlxuICogQHBhcmFtIHZhbHVlIHRoZSByZXR1cm4gdmFsdWUgZm9yIHRoZSBzdXJyb3VuZGluZyBnZW5lcmF0b3JcbiAqIEB0aHJvd3MgUmV0dXJuVmFsdWUgZXhjZXB0aW9uIHdpdGggdGhlIHZhbHVlLlxuICogQGV4YW1wbGVcbiAqIC8vIEVTNiBzdHlsZVxuICogUS5hc3luYyhmdW5jdGlvbiogKCkge1xuICogICAgICB2YXIgZm9vID0geWllbGQgZ2V0Rm9vUHJvbWlzZSgpO1xuICogICAgICB2YXIgYmFyID0geWllbGQgZ2V0QmFyUHJvbWlzZSgpO1xuICogICAgICByZXR1cm4gZm9vICsgYmFyO1xuICogfSlcbiAqIC8vIE9sZGVyIFNwaWRlck1vbmtleSBzdHlsZVxuICogUS5hc3luYyhmdW5jdGlvbiAoKSB7XG4gKiAgICAgIHZhciBmb28gPSB5aWVsZCBnZXRGb29Qcm9taXNlKCk7XG4gKiAgICAgIHZhciBiYXIgPSB5aWVsZCBnZXRCYXJQcm9taXNlKCk7XG4gKiAgICAgIFEucmV0dXJuKGZvbyArIGJhcik7XG4gKiB9KVxuICovXG5RW1wicmV0dXJuXCJdID0gX3JldHVybjtcbmZ1bmN0aW9uIF9yZXR1cm4odmFsdWUpIHtcbiAgICB0aHJvdyBuZXcgUVJldHVyblZhbHVlKHZhbHVlKTtcbn1cblxuLyoqXG4gKiBUaGUgcHJvbWlzZWQgZnVuY3Rpb24gZGVjb3JhdG9yIGVuc3VyZXMgdGhhdCBhbnkgcHJvbWlzZSBhcmd1bWVudHNcbiAqIGFyZSBzZXR0bGVkIGFuZCBwYXNzZWQgYXMgdmFsdWVzIChgdGhpc2AgaXMgYWxzbyBzZXR0bGVkIGFuZCBwYXNzZWRcbiAqIGFzIGEgdmFsdWUpLiAgSXQgd2lsbCBhbHNvIGVuc3VyZSB0aGF0IHRoZSByZXN1bHQgb2YgYSBmdW5jdGlvbiBpc1xuICogYWx3YXlzIGEgcHJvbWlzZS5cbiAqXG4gKiBAZXhhbXBsZVxuICogdmFyIGFkZCA9IFEucHJvbWlzZWQoZnVuY3Rpb24gKGEsIGIpIHtcbiAqICAgICByZXR1cm4gYSArIGI7XG4gKiB9KTtcbiAqIGFkZChRKGEpLCBRKEIpKTtcbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdG8gZGVjb3JhdGVcbiAqIEByZXR1cm5zIHtmdW5jdGlvbn0gYSBmdW5jdGlvbiB0aGF0IGhhcyBiZWVuIGRlY29yYXRlZC5cbiAqL1xuUS5wcm9taXNlZCA9IHByb21pc2VkO1xuZnVuY3Rpb24gcHJvbWlzZWQoY2FsbGJhY2spIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gc3ByZWFkKFt0aGlzLCBhbGwoYXJndW1lbnRzKV0sIGZ1bmN0aW9uIChzZWxmLCBhcmdzKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2suYXBwbHkoc2VsZiwgYXJncyk7XG4gICAgICAgIH0pO1xuICAgIH07XG59XG5cbi8qKlxuICogc2VuZHMgYSBtZXNzYWdlIHRvIGEgdmFsdWUgaW4gYSBmdXR1cmUgdHVyblxuICogQHBhcmFtIG9iamVjdCogdGhlIHJlY2lwaWVudFxuICogQHBhcmFtIG9wIHRoZSBuYW1lIG9mIHRoZSBtZXNzYWdlIG9wZXJhdGlvbiwgZS5nLiwgXCJ3aGVuXCIsXG4gKiBAcGFyYW0gYXJncyBmdXJ0aGVyIGFyZ3VtZW50cyB0byBiZSBmb3J3YXJkZWQgdG8gdGhlIG9wZXJhdGlvblxuICogQHJldHVybnMgcmVzdWx0IHtQcm9taXNlfSBhIHByb21pc2UgZm9yIHRoZSByZXN1bHQgb2YgdGhlIG9wZXJhdGlvblxuICovXG5RLmRpc3BhdGNoID0gZGlzcGF0Y2g7XG5mdW5jdGlvbiBkaXNwYXRjaChvYmplY3QsIG9wLCBhcmdzKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChvcCwgYXJncyk7XG59XG5cblByb21pc2UucHJvdG90eXBlLmRpc3BhdGNoID0gZnVuY3Rpb24gKG9wLCBhcmdzKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgbmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICBzZWxmLnByb21pc2VEaXNwYXRjaChkZWZlcnJlZC5yZXNvbHZlLCBvcCwgYXJncyk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG59O1xuXG4vKipcbiAqIEdldHMgdGhlIHZhbHVlIG9mIGEgcHJvcGVydHkgaW4gYSBmdXR1cmUgdHVybi5cbiAqIEBwYXJhbSBvYmplY3QgICAgcHJvbWlzZSBvciBpbW1lZGlhdGUgcmVmZXJlbmNlIGZvciB0YXJnZXQgb2JqZWN0XG4gKiBAcGFyYW0gbmFtZSAgICAgIG5hbWUgb2YgcHJvcGVydHkgdG8gZ2V0XG4gKiBAcmV0dXJuIHByb21pc2UgZm9yIHRoZSBwcm9wZXJ0eSB2YWx1ZVxuICovXG5RLmdldCA9IGZ1bmN0aW9uIChvYmplY3QsIGtleSkge1xuICAgIHJldHVybiBRKG9iamVjdCkuZGlzcGF0Y2goXCJnZXRcIiwgW2tleV0pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKGtleSkge1xuICAgIHJldHVybiB0aGlzLmRpc3BhdGNoKFwiZ2V0XCIsIFtrZXldKTtcbn07XG5cbi8qKlxuICogU2V0cyB0aGUgdmFsdWUgb2YgYSBwcm9wZXJ0eSBpbiBhIGZ1dHVyZSB0dXJuLlxuICogQHBhcmFtIG9iamVjdCAgICBwcm9taXNlIG9yIGltbWVkaWF0ZSByZWZlcmVuY2UgZm9yIG9iamVjdCBvYmplY3RcbiAqIEBwYXJhbSBuYW1lICAgICAgbmFtZSBvZiBwcm9wZXJ0eSB0byBzZXRcbiAqIEBwYXJhbSB2YWx1ZSAgICAgbmV3IHZhbHVlIG9mIHByb3BlcnR5XG4gKiBAcmV0dXJuIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWVcbiAqL1xuUS5zZXQgPSBmdW5jdGlvbiAob2JqZWN0LCBrZXksIHZhbHVlKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChcInNldFwiLCBba2V5LCB2YWx1ZV0pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcbiAgICByZXR1cm4gdGhpcy5kaXNwYXRjaChcInNldFwiLCBba2V5LCB2YWx1ZV0pO1xufTtcblxuLyoqXG4gKiBEZWxldGVzIGEgcHJvcGVydHkgaW4gYSBmdXR1cmUgdHVybi5cbiAqIEBwYXJhbSBvYmplY3QgICAgcHJvbWlzZSBvciBpbW1lZGlhdGUgcmVmZXJlbmNlIGZvciB0YXJnZXQgb2JqZWN0XG4gKiBAcGFyYW0gbmFtZSAgICAgIG5hbWUgb2YgcHJvcGVydHkgdG8gZGVsZXRlXG4gKiBAcmV0dXJuIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWVcbiAqL1xuUS5kZWwgPSAvLyBYWFggbGVnYWN5XG5RW1wiZGVsZXRlXCJdID0gZnVuY3Rpb24gKG9iamVjdCwga2V5KSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChcImRlbGV0ZVwiLCBba2V5XSk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5kZWwgPSAvLyBYWFggbGVnYWN5XG5Qcm9taXNlLnByb3RvdHlwZVtcImRlbGV0ZVwiXSA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gdGhpcy5kaXNwYXRjaChcImRlbGV0ZVwiLCBba2V5XSk7XG59O1xuXG4vKipcbiAqIEludm9rZXMgYSBtZXRob2QgaW4gYSBmdXR1cmUgdHVybi5cbiAqIEBwYXJhbSBvYmplY3QgICAgcHJvbWlzZSBvciBpbW1lZGlhdGUgcmVmZXJlbmNlIGZvciB0YXJnZXQgb2JqZWN0XG4gKiBAcGFyYW0gbmFtZSAgICAgIG5hbWUgb2YgbWV0aG9kIHRvIGludm9rZVxuICogQHBhcmFtIHZhbHVlICAgICBhIHZhbHVlIHRvIHBvc3QsIHR5cGljYWxseSBhbiBhcnJheSBvZlxuICogICAgICAgICAgICAgICAgICBpbnZvY2F0aW9uIGFyZ3VtZW50cyBmb3IgcHJvbWlzZXMgdGhhdFxuICogICAgICAgICAgICAgICAgICBhcmUgdWx0aW1hdGVseSBiYWNrZWQgd2l0aCBgcmVzb2x2ZWAgdmFsdWVzLFxuICogICAgICAgICAgICAgICAgICBhcyBvcHBvc2VkIHRvIHRob3NlIGJhY2tlZCB3aXRoIFVSTHNcbiAqICAgICAgICAgICAgICAgICAgd2hlcmVpbiB0aGUgcG9zdGVkIHZhbHVlIGNhbiBiZSBhbnlcbiAqICAgICAgICAgICAgICAgICAgSlNPTiBzZXJpYWxpemFibGUgb2JqZWN0LlxuICogQHJldHVybiBwcm9taXNlIGZvciB0aGUgcmV0dXJuIHZhbHVlXG4gKi9cbi8vIGJvdW5kIGxvY2FsbHkgYmVjYXVzZSBpdCBpcyB1c2VkIGJ5IG90aGVyIG1ldGhvZHNcblEubWFwcGx5ID0gLy8gWFhYIEFzIHByb3Bvc2VkIGJ5IFwiUmVkc2FuZHJvXCJcblEucG9zdCA9IGZ1bmN0aW9uIChvYmplY3QsIG5hbWUsIGFyZ3MpIHtcbiAgICByZXR1cm4gUShvYmplY3QpLmRpc3BhdGNoKFwicG9zdFwiLCBbbmFtZSwgYXJnc10pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUubWFwcGx5ID0gLy8gWFhYIEFzIHByb3Bvc2VkIGJ5IFwiUmVkc2FuZHJvXCJcblByb21pc2UucHJvdG90eXBlLnBvc3QgPSBmdW5jdGlvbiAobmFtZSwgYXJncykge1xuICAgIHJldHVybiB0aGlzLmRpc3BhdGNoKFwicG9zdFwiLCBbbmFtZSwgYXJnc10pO1xufTtcblxuLyoqXG4gKiBJbnZva2VzIGEgbWV0aG9kIGluIGEgZnV0dXJlIHR1cm4uXG4gKiBAcGFyYW0gb2JqZWN0ICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSBmb3IgdGFyZ2V0IG9iamVjdFxuICogQHBhcmFtIG5hbWUgICAgICBuYW1lIG9mIG1ldGhvZCB0byBpbnZva2VcbiAqIEBwYXJhbSAuLi5hcmdzICAgYXJyYXkgb2YgaW52b2NhdGlvbiBhcmd1bWVudHNcbiAqIEByZXR1cm4gcHJvbWlzZSBmb3IgdGhlIHJldHVybiB2YWx1ZVxuICovXG5RLnNlbmQgPSAvLyBYWFggTWFyayBNaWxsZXIncyBwcm9wb3NlZCBwYXJsYW5jZVxuUS5tY2FsbCA9IC8vIFhYWCBBcyBwcm9wb3NlZCBieSBcIlJlZHNhbmRyb1wiXG5RLmludm9rZSA9IGZ1bmN0aW9uIChvYmplY3QsIG5hbWUgLyouLi5hcmdzKi8pIHtcbiAgICByZXR1cm4gUShvYmplY3QpLmRpc3BhdGNoKFwicG9zdFwiLCBbbmFtZSwgYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAyKV0pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuc2VuZCA9IC8vIFhYWCBNYXJrIE1pbGxlcidzIHByb3Bvc2VkIHBhcmxhbmNlXG5Qcm9taXNlLnByb3RvdHlwZS5tY2FsbCA9IC8vIFhYWCBBcyBwcm9wb3NlZCBieSBcIlJlZHNhbmRyb1wiXG5Qcm9taXNlLnByb3RvdHlwZS5pbnZva2UgPSBmdW5jdGlvbiAobmFtZSAvKi4uLmFyZ3MqLykge1xuICAgIHJldHVybiB0aGlzLmRpc3BhdGNoKFwicG9zdFwiLCBbbmFtZSwgYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKV0pO1xufTtcblxuLyoqXG4gKiBBcHBsaWVzIHRoZSBwcm9taXNlZCBmdW5jdGlvbiBpbiBhIGZ1dHVyZSB0dXJuLlxuICogQHBhcmFtIG9iamVjdCAgICBwcm9taXNlIG9yIGltbWVkaWF0ZSByZWZlcmVuY2UgZm9yIHRhcmdldCBmdW5jdGlvblxuICogQHBhcmFtIGFyZ3MgICAgICBhcnJheSBvZiBhcHBsaWNhdGlvbiBhcmd1bWVudHNcbiAqL1xuUS5mYXBwbHkgPSBmdW5jdGlvbiAob2JqZWN0LCBhcmdzKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChcImFwcGx5XCIsIFt2b2lkIDAsIGFyZ3NdKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLmZhcHBseSA9IGZ1bmN0aW9uIChhcmdzKSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcGF0Y2goXCJhcHBseVwiLCBbdm9pZCAwLCBhcmdzXSk7XG59O1xuXG4vKipcbiAqIENhbGxzIHRoZSBwcm9taXNlZCBmdW5jdGlvbiBpbiBhIGZ1dHVyZSB0dXJuLlxuICogQHBhcmFtIG9iamVjdCAgICBwcm9taXNlIG9yIGltbWVkaWF0ZSByZWZlcmVuY2UgZm9yIHRhcmdldCBmdW5jdGlvblxuICogQHBhcmFtIC4uLmFyZ3MgICBhcnJheSBvZiBhcHBsaWNhdGlvbiBhcmd1bWVudHNcbiAqL1xuUVtcInRyeVwiXSA9XG5RLmZjYWxsID0gZnVuY3Rpb24gKG9iamVjdCAvKiAuLi5hcmdzKi8pIHtcbiAgICByZXR1cm4gUShvYmplY3QpLmRpc3BhdGNoKFwiYXBwbHlcIiwgW3ZvaWQgMCwgYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKV0pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZmNhbGwgPSBmdW5jdGlvbiAoLyouLi5hcmdzKi8pIHtcbiAgICByZXR1cm4gdGhpcy5kaXNwYXRjaChcImFwcGx5XCIsIFt2b2lkIDAsIGFycmF5X3NsaWNlKGFyZ3VtZW50cyldKTtcbn07XG5cbi8qKlxuICogQmluZHMgdGhlIHByb21pc2VkIGZ1bmN0aW9uLCB0cmFuc2Zvcm1pbmcgcmV0dXJuIHZhbHVlcyBpbnRvIGEgZnVsZmlsbGVkXG4gKiBwcm9taXNlIGFuZCB0aHJvd24gZXJyb3JzIGludG8gYSByZWplY3RlZCBvbmUuXG4gKiBAcGFyYW0gb2JqZWN0ICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSBmb3IgdGFyZ2V0IGZ1bmN0aW9uXG4gKiBAcGFyYW0gLi4uYXJncyAgIGFycmF5IG9mIGFwcGxpY2F0aW9uIGFyZ3VtZW50c1xuICovXG5RLmZiaW5kID0gZnVuY3Rpb24gKG9iamVjdCAvKi4uLmFyZ3MqLykge1xuICAgIHZhciBwcm9taXNlID0gUShvYmplY3QpO1xuICAgIHZhciBhcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gZmJvdW5kKCkge1xuICAgICAgICByZXR1cm4gcHJvbWlzZS5kaXNwYXRjaChcImFwcGx5XCIsIFtcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICBhcmdzLmNvbmNhdChhcnJheV9zbGljZShhcmd1bWVudHMpKVxuICAgICAgICBdKTtcbiAgICB9O1xufTtcblByb21pc2UucHJvdG90eXBlLmZiaW5kID0gZnVuY3Rpb24gKC8qLi4uYXJncyovKSB7XG4gICAgdmFyIHByb21pc2UgPSB0aGlzO1xuICAgIHZhciBhcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gZmJvdW5kKCkge1xuICAgICAgICByZXR1cm4gcHJvbWlzZS5kaXNwYXRjaChcImFwcGx5XCIsIFtcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICBhcmdzLmNvbmNhdChhcnJheV9zbGljZShhcmd1bWVudHMpKVxuICAgICAgICBdKTtcbiAgICB9O1xufTtcblxuLyoqXG4gKiBSZXF1ZXN0cyB0aGUgbmFtZXMgb2YgdGhlIG93bmVkIHByb3BlcnRpZXMgb2YgYSBwcm9taXNlZFxuICogb2JqZWN0IGluIGEgZnV0dXJlIHR1cm4uXG4gKiBAcGFyYW0gb2JqZWN0ICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSBmb3IgdGFyZ2V0IG9iamVjdFxuICogQHJldHVybiBwcm9taXNlIGZvciB0aGUga2V5cyBvZiB0aGUgZXZlbnR1YWxseSBzZXR0bGVkIG9iamVjdFxuICovXG5RLmtleXMgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChcImtleXNcIiwgW10pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUua2V5cyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5kaXNwYXRjaChcImtleXNcIiwgW10pO1xufTtcblxuLyoqXG4gKiBUdXJucyBhbiBhcnJheSBvZiBwcm9taXNlcyBpbnRvIGEgcHJvbWlzZSBmb3IgYW4gYXJyYXkuICBJZiBhbnkgb2ZcbiAqIHRoZSBwcm9taXNlcyBnZXRzIHJlamVjdGVkLCB0aGUgd2hvbGUgYXJyYXkgaXMgcmVqZWN0ZWQgaW1tZWRpYXRlbHkuXG4gKiBAcGFyYW0ge0FycmF5Kn0gYW4gYXJyYXkgKG9yIHByb21pc2UgZm9yIGFuIGFycmF5KSBvZiB2YWx1ZXMgKG9yXG4gKiBwcm9taXNlcyBmb3IgdmFsdWVzKVxuICogQHJldHVybnMgYSBwcm9taXNlIGZvciBhbiBhcnJheSBvZiB0aGUgY29ycmVzcG9uZGluZyB2YWx1ZXNcbiAqL1xuLy8gQnkgTWFyayBNaWxsZXJcbi8vIGh0dHA6Ly93aWtpLmVjbWFzY3JpcHQub3JnL2Rva3UucGhwP2lkPXN0cmF3bWFuOmNvbmN1cnJlbmN5JnJldj0xMzA4Nzc2NTIxI2FsbGZ1bGZpbGxlZFxuUS5hbGwgPSBhbGw7XG5mdW5jdGlvbiBhbGwocHJvbWlzZXMpIHtcbiAgICByZXR1cm4gd2hlbihwcm9taXNlcywgZnVuY3Rpb24gKHByb21pc2VzKSB7XG4gICAgICAgIHZhciBjb3VudERvd24gPSAwO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgICAgICBhcnJheV9yZWR1Y2UocHJvbWlzZXMsIGZ1bmN0aW9uICh1bmRlZmluZWQsIHByb21pc2UsIGluZGV4KSB7XG4gICAgICAgICAgICB2YXIgc25hcHNob3Q7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgaXNQcm9taXNlKHByb21pc2UpICYmXG4gICAgICAgICAgICAgICAgKHNuYXBzaG90ID0gcHJvbWlzZS5pbnNwZWN0KCkpLnN0YXRlID09PSBcImZ1bGZpbGxlZFwiXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICBwcm9taXNlc1tpbmRleF0gPSBzbmFwc2hvdC52YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgKytjb3VudERvd247XG4gICAgICAgICAgICAgICAgd2hlbihcbiAgICAgICAgICAgICAgICAgICAgcHJvbWlzZSxcbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9taXNlc1tpbmRleF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICgtLWNvdW50RG93biA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocHJvbWlzZXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QsXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChwcm9ncmVzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KHsgaW5kZXg6IGluZGV4LCB2YWx1ZTogcHJvZ3Jlc3MgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCB2b2lkIDApO1xuICAgICAgICBpZiAoY291bnREb3duID09PSAwKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHByb21pc2VzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9KTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUuYWxsID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBhbGwodGhpcyk7XG59O1xuXG4vKipcbiAqIFdhaXRzIGZvciBhbGwgcHJvbWlzZXMgdG8gYmUgc2V0dGxlZCwgZWl0aGVyIGZ1bGZpbGxlZCBvclxuICogcmVqZWN0ZWQuICBUaGlzIGlzIGRpc3RpbmN0IGZyb20gYGFsbGAgc2luY2UgdGhhdCB3b3VsZCBzdG9wXG4gKiB3YWl0aW5nIGF0IHRoZSBmaXJzdCByZWplY3Rpb24uICBUaGUgcHJvbWlzZSByZXR1cm5lZCBieVxuICogYGFsbFJlc29sdmVkYCB3aWxsIG5ldmVyIGJlIHJlamVjdGVkLlxuICogQHBhcmFtIHByb21pc2VzIGEgcHJvbWlzZSBmb3IgYW4gYXJyYXkgKG9yIGFuIGFycmF5KSBvZiBwcm9taXNlc1xuICogKG9yIHZhbHVlcylcbiAqIEByZXR1cm4gYSBwcm9taXNlIGZvciBhbiBhcnJheSBvZiBwcm9taXNlc1xuICovXG5RLmFsbFJlc29sdmVkID0gZGVwcmVjYXRlKGFsbFJlc29sdmVkLCBcImFsbFJlc29sdmVkXCIsIFwiYWxsU2V0dGxlZFwiKTtcbmZ1bmN0aW9uIGFsbFJlc29sdmVkKHByb21pc2VzKSB7XG4gICAgcmV0dXJuIHdoZW4ocHJvbWlzZXMsIGZ1bmN0aW9uIChwcm9taXNlcykge1xuICAgICAgICBwcm9taXNlcyA9IGFycmF5X21hcChwcm9taXNlcywgUSk7XG4gICAgICAgIHJldHVybiB3aGVuKGFsbChhcnJheV9tYXAocHJvbWlzZXMsIGZ1bmN0aW9uIChwcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm4gd2hlbihwcm9taXNlLCBub29wLCBub29wKTtcbiAgICAgICAgfSkpLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvbWlzZXM7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS5hbGxSZXNvbHZlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gYWxsUmVzb2x2ZWQodGhpcyk7XG59O1xuXG4vKipcbiAqIEBzZWUgUHJvbWlzZSNhbGxTZXR0bGVkXG4gKi9cblEuYWxsU2V0dGxlZCA9IGFsbFNldHRsZWQ7XG5mdW5jdGlvbiBhbGxTZXR0bGVkKHByb21pc2VzKSB7XG4gICAgcmV0dXJuIFEocHJvbWlzZXMpLmFsbFNldHRsZWQoKTtcbn1cblxuLyoqXG4gKiBUdXJucyBhbiBhcnJheSBvZiBwcm9taXNlcyBpbnRvIGEgcHJvbWlzZSBmb3IgYW4gYXJyYXkgb2YgdGhlaXIgc3RhdGVzIChhc1xuICogcmV0dXJuZWQgYnkgYGluc3BlY3RgKSB3aGVuIHRoZXkgaGF2ZSBhbGwgc2V0dGxlZC5cbiAqIEBwYXJhbSB7QXJyYXlbQW55Kl19IHZhbHVlcyBhbiBhcnJheSAob3IgcHJvbWlzZSBmb3IgYW4gYXJyYXkpIG9mIHZhbHVlcyAob3JcbiAqIHByb21pc2VzIGZvciB2YWx1ZXMpXG4gKiBAcmV0dXJucyB7QXJyYXlbU3RhdGVdfSBhbiBhcnJheSBvZiBzdGF0ZXMgZm9yIHRoZSByZXNwZWN0aXZlIHZhbHVlcy5cbiAqL1xuUHJvbWlzZS5wcm90b3R5cGUuYWxsU2V0dGxlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKGZ1bmN0aW9uIChwcm9taXNlcykge1xuICAgICAgICByZXR1cm4gYWxsKGFycmF5X21hcChwcm9taXNlcywgZnVuY3Rpb24gKHByb21pc2UpIHtcbiAgICAgICAgICAgIHByb21pc2UgPSBRKHByb21pc2UpO1xuICAgICAgICAgICAgZnVuY3Rpb24gcmVnYXJkbGVzcygpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJvbWlzZS5pbnNwZWN0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuKHJlZ2FyZGxlc3MsIHJlZ2FyZGxlc3MpO1xuICAgICAgICB9KSk7XG4gICAgfSk7XG59O1xuXG4vKipcbiAqIENhcHR1cmVzIHRoZSBmYWlsdXJlIG9mIGEgcHJvbWlzZSwgZ2l2aW5nIGFuIG9wb3J0dW5pdHkgdG8gcmVjb3ZlclxuICogd2l0aCBhIGNhbGxiYWNrLiAgSWYgdGhlIGdpdmVuIHByb21pc2UgaXMgZnVsZmlsbGVkLCB0aGUgcmV0dXJuZWRcbiAqIHByb21pc2UgaXMgZnVsZmlsbGVkLlxuICogQHBhcmFtIHtBbnkqfSBwcm9taXNlIGZvciBzb21ldGhpbmdcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIHRvIGZ1bGZpbGwgdGhlIHJldHVybmVkIHByb21pc2UgaWYgdGhlXG4gKiBnaXZlbiBwcm9taXNlIGlzIHJlamVjdGVkXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGNhbGxiYWNrXG4gKi9cblEuZmFpbCA9IC8vIFhYWCBsZWdhY3lcblFbXCJjYXRjaFwiXSA9IGZ1bmN0aW9uIChvYmplY3QsIHJlamVjdGVkKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS50aGVuKHZvaWQgMCwgcmVqZWN0ZWQpO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZmFpbCA9IC8vIFhYWCBsZWdhY3lcblByb21pc2UucHJvdG90eXBlW1wiY2F0Y2hcIl0gPSBmdW5jdGlvbiAocmVqZWN0ZWQpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKHZvaWQgMCwgcmVqZWN0ZWQpO1xufTtcblxuLyoqXG4gKiBBdHRhY2hlcyBhIGxpc3RlbmVyIHRoYXQgY2FuIHJlc3BvbmQgdG8gcHJvZ3Jlc3Mgbm90aWZpY2F0aW9ucyBmcm9tIGFcbiAqIHByb21pc2UncyBvcmlnaW5hdGluZyBkZWZlcnJlZC4gVGhpcyBsaXN0ZW5lciByZWNlaXZlcyB0aGUgZXhhY3QgYXJndW1lbnRzXG4gKiBwYXNzZWQgdG8gYGBkZWZlcnJlZC5ub3RpZnlgYC5cbiAqIEBwYXJhbSB7QW55Kn0gcHJvbWlzZSBmb3Igc29tZXRoaW5nXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayB0byByZWNlaXZlIGFueSBwcm9ncmVzcyBub3RpZmljYXRpb25zXG4gKiBAcmV0dXJucyB0aGUgZ2l2ZW4gcHJvbWlzZSwgdW5jaGFuZ2VkXG4gKi9cblEucHJvZ3Jlc3MgPSBwcm9ncmVzcztcbmZ1bmN0aW9uIHByb2dyZXNzKG9iamVjdCwgcHJvZ3Jlc3NlZCkge1xuICAgIHJldHVybiBRKG9iamVjdCkudGhlbih2b2lkIDAsIHZvaWQgMCwgcHJvZ3Jlc3NlZCk7XG59XG5cblByb21pc2UucHJvdG90eXBlLnByb2dyZXNzID0gZnVuY3Rpb24gKHByb2dyZXNzZWQpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKHZvaWQgMCwgdm9pZCAwLCBwcm9ncmVzc2VkKTtcbn07XG5cbi8qKlxuICogUHJvdmlkZXMgYW4gb3Bwb3J0dW5pdHkgdG8gb2JzZXJ2ZSB0aGUgc2V0dGxpbmcgb2YgYSBwcm9taXNlLFxuICogcmVnYXJkbGVzcyBvZiB3aGV0aGVyIHRoZSBwcm9taXNlIGlzIGZ1bGZpbGxlZCBvciByZWplY3RlZC4gIEZvcndhcmRzXG4gKiB0aGUgcmVzb2x1dGlvbiB0byB0aGUgcmV0dXJuZWQgcHJvbWlzZSB3aGVuIHRoZSBjYWxsYmFjayBpcyBkb25lLlxuICogVGhlIGNhbGxiYWNrIGNhbiByZXR1cm4gYSBwcm9taXNlIHRvIGRlZmVyIGNvbXBsZXRpb24uXG4gKiBAcGFyYW0ge0FueSp9IHByb21pc2VcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIHRvIG9ic2VydmUgdGhlIHJlc29sdXRpb24gb2YgdGhlIGdpdmVuXG4gKiBwcm9taXNlLCB0YWtlcyBubyBhcmd1bWVudHMuXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBnaXZlbiBwcm9taXNlIHdoZW5cbiAqIGBgZmluYGAgaXMgZG9uZS5cbiAqL1xuUS5maW4gPSAvLyBYWFggbGVnYWN5XG5RW1wiZmluYWxseVwiXSA9IGZ1bmN0aW9uIChvYmplY3QsIGNhbGxiYWNrKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KVtcImZpbmFsbHlcIl0oY2FsbGJhY2spO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZmluID0gLy8gWFhYIGxlZ2FjeVxuUHJvbWlzZS5wcm90b3R5cGVbXCJmaW5hbGx5XCJdID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgY2FsbGJhY2sgPSBRKGNhbGxiYWNrKTtcbiAgICByZXR1cm4gdGhpcy50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2suZmNhbGwoKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSk7XG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICAvLyBUT0RPIGF0dGVtcHQgdG8gcmVjeWNsZSB0aGUgcmVqZWN0aW9uIHdpdGggXCJ0aGlzXCIuXG4gICAgICAgIHJldHVybiBjYWxsYmFjay5mY2FsbCgpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhyb3cgcmVhc29uO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogVGVybWluYXRlcyBhIGNoYWluIG9mIHByb21pc2VzLCBmb3JjaW5nIHJlamVjdGlvbnMgdG8gYmVcbiAqIHRocm93biBhcyBleGNlcHRpb25zLlxuICogQHBhcmFtIHtBbnkqfSBwcm9taXNlIGF0IHRoZSBlbmQgb2YgYSBjaGFpbiBvZiBwcm9taXNlc1xuICogQHJldHVybnMgbm90aGluZ1xuICovXG5RLmRvbmUgPSBmdW5jdGlvbiAob2JqZWN0LCBmdWxmaWxsZWQsIHJlamVjdGVkLCBwcm9ncmVzcykge1xuICAgIHJldHVybiBRKG9iamVjdCkuZG9uZShmdWxmaWxsZWQsIHJlamVjdGVkLCBwcm9ncmVzcyk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5kb25lID0gZnVuY3Rpb24gKGZ1bGZpbGxlZCwgcmVqZWN0ZWQsIHByb2dyZXNzKSB7XG4gICAgdmFyIG9uVW5oYW5kbGVkRXJyb3IgPSBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgLy8gZm9yd2FyZCB0byBhIGZ1dHVyZSB0dXJuIHNvIHRoYXQgYGB3aGVuYGBcbiAgICAgICAgLy8gZG9lcyBub3QgY2F0Y2ggaXQgYW5kIHR1cm4gaXQgaW50byBhIHJlamVjdGlvbi5cbiAgICAgICAgbmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgbWFrZVN0YWNrVHJhY2VMb25nKGVycm9yLCBwcm9taXNlKTtcbiAgICAgICAgICAgIGlmIChRLm9uZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBRLm9uZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8vIEF2b2lkIHVubmVjZXNzYXJ5IGBuZXh0VGlja2BpbmcgdmlhIGFuIHVubmVjZXNzYXJ5IGB3aGVuYC5cbiAgICB2YXIgcHJvbWlzZSA9IGZ1bGZpbGxlZCB8fCByZWplY3RlZCB8fCBwcm9ncmVzcyA/XG4gICAgICAgIHRoaXMudGhlbihmdWxmaWxsZWQsIHJlamVjdGVkLCBwcm9ncmVzcykgOlxuICAgICAgICB0aGlzO1xuXG4gICAgaWYgKHR5cGVvZiBwcm9jZXNzID09PSBcIm9iamVjdFwiICYmIHByb2Nlc3MgJiYgcHJvY2Vzcy5kb21haW4pIHtcbiAgICAgICAgb25VbmhhbmRsZWRFcnJvciA9IHByb2Nlc3MuZG9tYWluLmJpbmQob25VbmhhbmRsZWRFcnJvcik7XG4gICAgfVxuXG4gICAgcHJvbWlzZS50aGVuKHZvaWQgMCwgb25VbmhhbmRsZWRFcnJvcik7XG59O1xuXG4vKipcbiAqIENhdXNlcyBhIHByb21pc2UgdG8gYmUgcmVqZWN0ZWQgaWYgaXQgZG9lcyBub3QgZ2V0IGZ1bGZpbGxlZCBiZWZvcmVcbiAqIHNvbWUgbWlsbGlzZWNvbmRzIHRpbWUgb3V0LlxuICogQHBhcmFtIHtBbnkqfSBwcm9taXNlXG4gKiBAcGFyYW0ge051bWJlcn0gbWlsbGlzZWNvbmRzIHRpbWVvdXRcbiAqIEBwYXJhbSB7U3RyaW5nfSBjdXN0b20gZXJyb3IgbWVzc2FnZSAob3B0aW9uYWwpXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBnaXZlbiBwcm9taXNlIGlmIGl0IGlzXG4gKiBmdWxmaWxsZWQgYmVmb3JlIHRoZSB0aW1lb3V0LCBvdGhlcndpc2UgcmVqZWN0ZWQuXG4gKi9cblEudGltZW91dCA9IGZ1bmN0aW9uIChvYmplY3QsIG1zLCBtZXNzYWdlKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS50aW1lb3V0KG1zLCBtZXNzYWdlKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLnRpbWVvdXQgPSBmdW5jdGlvbiAobXMsIG1lc3NhZ2UpIHtcbiAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgIHZhciB0aW1lb3V0SWQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZGVmZXJyZWQucmVqZWN0KG5ldyBFcnJvcihtZXNzYWdlIHx8IFwiVGltZWQgb3V0IGFmdGVyIFwiICsgbXMgKyBcIiBtc1wiKSk7XG4gICAgfSwgbXMpO1xuXG4gICAgdGhpcy50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh2YWx1ZSk7XG4gICAgfSwgZnVuY3Rpb24gKGV4Y2VwdGlvbikge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICAgICAgZGVmZXJyZWQucmVqZWN0KGV4Y2VwdGlvbik7XG4gICAgfSwgZGVmZXJyZWQubm90aWZ5KTtcblxuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIGdpdmVuIHZhbHVlIChvciBwcm9taXNlZCB2YWx1ZSksIHNvbWVcbiAqIG1pbGxpc2Vjb25kcyBhZnRlciBpdCByZXNvbHZlZC4gUGFzc2VzIHJlamVjdGlvbnMgaW1tZWRpYXRlbHkuXG4gKiBAcGFyYW0ge0FueSp9IHByb21pc2VcbiAqIEBwYXJhbSB7TnVtYmVyfSBtaWxsaXNlY29uZHNcbiAqIEByZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHJlc29sdXRpb24gb2YgdGhlIGdpdmVuIHByb21pc2UgYWZ0ZXIgbWlsbGlzZWNvbmRzXG4gKiB0aW1lIGhhcyBlbGFwc2VkIHNpbmNlIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBnaXZlbiBwcm9taXNlLlxuICogSWYgdGhlIGdpdmVuIHByb21pc2UgcmVqZWN0cywgdGhhdCBpcyBwYXNzZWQgaW1tZWRpYXRlbHkuXG4gKi9cblEuZGVsYXkgPSBmdW5jdGlvbiAob2JqZWN0LCB0aW1lb3V0KSB7XG4gICAgaWYgKHRpbWVvdXQgPT09IHZvaWQgMCkge1xuICAgICAgICB0aW1lb3V0ID0gb2JqZWN0O1xuICAgICAgICBvYmplY3QgPSB2b2lkIDA7XG4gICAgfVxuICAgIHJldHVybiBRKG9iamVjdCkuZGVsYXkodGltZW91dCk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5kZWxheSA9IGZ1bmN0aW9uICh0aW1lb3V0KSB7XG4gICAgcmV0dXJuIHRoaXMudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgfSwgdGltZW91dCk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH0pO1xufTtcblxuLyoqXG4gKiBQYXNzZXMgYSBjb250aW51YXRpb24gdG8gYSBOb2RlIGZ1bmN0aW9uLCB3aGljaCBpcyBjYWxsZWQgd2l0aCB0aGUgZ2l2ZW5cbiAqIGFyZ3VtZW50cyBwcm92aWRlZCBhcyBhbiBhcnJheSwgYW5kIHJldHVybnMgYSBwcm9taXNlLlxuICpcbiAqICAgICAgUS5uZmFwcGx5KEZTLnJlYWRGaWxlLCBbX19maWxlbmFtZV0pXG4gKiAgICAgIC50aGVuKGZ1bmN0aW9uIChjb250ZW50KSB7XG4gKiAgICAgIH0pXG4gKlxuICovXG5RLm5mYXBwbHkgPSBmdW5jdGlvbiAoY2FsbGJhY2ssIGFyZ3MpIHtcbiAgICByZXR1cm4gUShjYWxsYmFjaykubmZhcHBseShhcmdzKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLm5mYXBwbHkgPSBmdW5jdGlvbiAoYXJncykge1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgdmFyIG5vZGVBcmdzID0gYXJyYXlfc2xpY2UoYXJncyk7XG4gICAgbm9kZUFyZ3MucHVzaChkZWZlcnJlZC5tYWtlTm9kZVJlc29sdmVyKCkpO1xuICAgIHRoaXMuZmFwcGx5KG5vZGVBcmdzKS5mYWlsKGRlZmVycmVkLnJlamVjdCk7XG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG59O1xuXG4vKipcbiAqIFBhc3NlcyBhIGNvbnRpbnVhdGlvbiB0byBhIE5vZGUgZnVuY3Rpb24sIHdoaWNoIGlzIGNhbGxlZCB3aXRoIHRoZSBnaXZlblxuICogYXJndW1lbnRzIHByb3ZpZGVkIGluZGl2aWR1YWxseSwgYW5kIHJldHVybnMgYSBwcm9taXNlLlxuICogQGV4YW1wbGVcbiAqIFEubmZjYWxsKEZTLnJlYWRGaWxlLCBfX2ZpbGVuYW1lKVxuICogLnRoZW4oZnVuY3Rpb24gKGNvbnRlbnQpIHtcbiAqIH0pXG4gKlxuICovXG5RLm5mY2FsbCA9IGZ1bmN0aW9uIChjYWxsYmFjayAvKi4uLmFyZ3MqLykge1xuICAgIHZhciBhcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKTtcbiAgICByZXR1cm4gUShjYWxsYmFjaykubmZhcHBseShhcmdzKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLm5mY2FsbCA9IGZ1bmN0aW9uICgvKi4uLmFyZ3MqLykge1xuICAgIHZhciBub2RlQXJncyA9IGFycmF5X3NsaWNlKGFyZ3VtZW50cyk7XG4gICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICBub2RlQXJncy5wdXNoKGRlZmVycmVkLm1ha2VOb2RlUmVzb2x2ZXIoKSk7XG4gICAgdGhpcy5mYXBwbHkobm9kZUFyZ3MpLmZhaWwoZGVmZXJyZWQucmVqZWN0KTtcbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn07XG5cbi8qKlxuICogV3JhcHMgYSBOb2RlSlMgY29udGludWF0aW9uIHBhc3NpbmcgZnVuY3Rpb24gYW5kIHJldHVybnMgYW4gZXF1aXZhbGVudFxuICogdmVyc2lvbiB0aGF0IHJldHVybnMgYSBwcm9taXNlLlxuICogQGV4YW1wbGVcbiAqIFEubmZiaW5kKEZTLnJlYWRGaWxlLCBfX2ZpbGVuYW1lKShcInV0Zi04XCIpXG4gKiAudGhlbihjb25zb2xlLmxvZylcbiAqIC5kb25lKClcbiAqL1xuUS5uZmJpbmQgPVxuUS5kZW5vZGVpZnkgPSBmdW5jdGlvbiAoY2FsbGJhY2sgLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgYmFzZUFyZ3MgPSBhcnJheV9zbGljZShhcmd1bWVudHMsIDEpO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBub2RlQXJncyA9IGJhc2VBcmdzLmNvbmNhdChhcnJheV9zbGljZShhcmd1bWVudHMpKTtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICAgICAgbm9kZUFyZ3MucHVzaChkZWZlcnJlZC5tYWtlTm9kZVJlc29sdmVyKCkpO1xuICAgICAgICBRKGNhbGxiYWNrKS5mYXBwbHkobm9kZUFyZ3MpLmZhaWwoZGVmZXJyZWQucmVqZWN0KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLm5mYmluZCA9XG5Qcm9taXNlLnByb3RvdHlwZS5kZW5vZGVpZnkgPSBmdW5jdGlvbiAoLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgYXJncyA9IGFycmF5X3NsaWNlKGFyZ3VtZW50cyk7XG4gICAgYXJncy51bnNoaWZ0KHRoaXMpO1xuICAgIHJldHVybiBRLmRlbm9kZWlmeS5hcHBseSh2b2lkIDAsIGFyZ3MpO1xufTtcblxuUS5uYmluZCA9IGZ1bmN0aW9uIChjYWxsYmFjaywgdGhpc3AgLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgYmFzZUFyZ3MgPSBhcnJheV9zbGljZShhcmd1bWVudHMsIDIpO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBub2RlQXJncyA9IGJhc2VBcmdzLmNvbmNhdChhcnJheV9zbGljZShhcmd1bWVudHMpKTtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICAgICAgbm9kZUFyZ3MucHVzaChkZWZlcnJlZC5tYWtlTm9kZVJlc29sdmVyKCkpO1xuICAgICAgICBmdW5jdGlvbiBib3VuZCgpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjay5hcHBseSh0aGlzcCwgYXJndW1lbnRzKTtcbiAgICAgICAgfVxuICAgICAgICBRKGJvdW5kKS5mYXBwbHkobm9kZUFyZ3MpLmZhaWwoZGVmZXJyZWQucmVqZWN0KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLm5iaW5kID0gZnVuY3Rpb24gKC8qdGhpc3AsIC4uLmFyZ3MqLykge1xuICAgIHZhciBhcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAwKTtcbiAgICBhcmdzLnVuc2hpZnQodGhpcyk7XG4gICAgcmV0dXJuIFEubmJpbmQuYXBwbHkodm9pZCAwLCBhcmdzKTtcbn07XG5cbi8qKlxuICogQ2FsbHMgYSBtZXRob2Qgb2YgYSBOb2RlLXN0eWxlIG9iamVjdCB0aGF0IGFjY2VwdHMgYSBOb2RlLXN0eWxlXG4gKiBjYWxsYmFjayB3aXRoIGEgZ2l2ZW4gYXJyYXkgb2YgYXJndW1lbnRzLCBwbHVzIGEgcHJvdmlkZWQgY2FsbGJhY2suXG4gKiBAcGFyYW0gb2JqZWN0IGFuIG9iamVjdCB0aGF0IGhhcyB0aGUgbmFtZWQgbWV0aG9kXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBuYW1lIG9mIHRoZSBtZXRob2Qgb2Ygb2JqZWN0XG4gKiBAcGFyYW0ge0FycmF5fSBhcmdzIGFyZ3VtZW50cyB0byBwYXNzIHRvIHRoZSBtZXRob2Q7IHRoZSBjYWxsYmFja1xuICogd2lsbCBiZSBwcm92aWRlZCBieSBRIGFuZCBhcHBlbmRlZCB0byB0aGVzZSBhcmd1bWVudHMuXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSB2YWx1ZSBvciBlcnJvclxuICovXG5RLm5tYXBwbHkgPSAvLyBYWFggQXMgcHJvcG9zZWQgYnkgXCJSZWRzYW5kcm9cIlxuUS5ucG9zdCA9IGZ1bmN0aW9uIChvYmplY3QsIG5hbWUsIGFyZ3MpIHtcbiAgICByZXR1cm4gUShvYmplY3QpLm5wb3N0KG5hbWUsIGFyZ3MpO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUubm1hcHBseSA9IC8vIFhYWCBBcyBwcm9wb3NlZCBieSBcIlJlZHNhbmRyb1wiXG5Qcm9taXNlLnByb3RvdHlwZS5ucG9zdCA9IGZ1bmN0aW9uIChuYW1lLCBhcmdzKSB7XG4gICAgdmFyIG5vZGVBcmdzID0gYXJyYXlfc2xpY2UoYXJncyB8fCBbXSk7XG4gICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICBub2RlQXJncy5wdXNoKGRlZmVycmVkLm1ha2VOb2RlUmVzb2x2ZXIoKSk7XG4gICAgdGhpcy5kaXNwYXRjaChcInBvc3RcIiwgW25hbWUsIG5vZGVBcmdzXSkuZmFpbChkZWZlcnJlZC5yZWplY3QpO1xuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufTtcblxuLyoqXG4gKiBDYWxscyBhIG1ldGhvZCBvZiBhIE5vZGUtc3R5bGUgb2JqZWN0IHRoYXQgYWNjZXB0cyBhIE5vZGUtc3R5bGVcbiAqIGNhbGxiYWNrLCBmb3J3YXJkaW5nIHRoZSBnaXZlbiB2YXJpYWRpYyBhcmd1bWVudHMsIHBsdXMgYSBwcm92aWRlZFxuICogY2FsbGJhY2sgYXJndW1lbnQuXG4gKiBAcGFyYW0gb2JqZWN0IGFuIG9iamVjdCB0aGF0IGhhcyB0aGUgbmFtZWQgbWV0aG9kXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBuYW1lIG9mIHRoZSBtZXRob2Qgb2Ygb2JqZWN0XG4gKiBAcGFyYW0gLi4uYXJncyBhcmd1bWVudHMgdG8gcGFzcyB0byB0aGUgbWV0aG9kOyB0aGUgY2FsbGJhY2sgd2lsbFxuICogYmUgcHJvdmlkZWQgYnkgUSBhbmQgYXBwZW5kZWQgdG8gdGhlc2UgYXJndW1lbnRzLlxuICogQHJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgdmFsdWUgb3IgZXJyb3JcbiAqL1xuUS5uc2VuZCA9IC8vIFhYWCBCYXNlZCBvbiBNYXJrIE1pbGxlcidzIHByb3Bvc2VkIFwic2VuZFwiXG5RLm5tY2FsbCA9IC8vIFhYWCBCYXNlZCBvbiBcIlJlZHNhbmRybydzXCIgcHJvcG9zYWxcblEubmludm9rZSA9IGZ1bmN0aW9uIChvYmplY3QsIG5hbWUgLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgbm9kZUFyZ3MgPSBhcnJheV9zbGljZShhcmd1bWVudHMsIDIpO1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgbm9kZUFyZ3MucHVzaChkZWZlcnJlZC5tYWtlTm9kZVJlc29sdmVyKCkpO1xuICAgIFEob2JqZWN0KS5kaXNwYXRjaChcInBvc3RcIiwgW25hbWUsIG5vZGVBcmdzXSkuZmFpbChkZWZlcnJlZC5yZWplY3QpO1xuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUubnNlbmQgPSAvLyBYWFggQmFzZWQgb24gTWFyayBNaWxsZXIncyBwcm9wb3NlZCBcInNlbmRcIlxuUHJvbWlzZS5wcm90b3R5cGUubm1jYWxsID0gLy8gWFhYIEJhc2VkIG9uIFwiUmVkc2FuZHJvJ3NcIiBwcm9wb3NhbFxuUHJvbWlzZS5wcm90b3R5cGUubmludm9rZSA9IGZ1bmN0aW9uIChuYW1lIC8qLi4uYXJncyovKSB7XG4gICAgdmFyIG5vZGVBcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKTtcbiAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgIG5vZGVBcmdzLnB1c2goZGVmZXJyZWQubWFrZU5vZGVSZXNvbHZlcigpKTtcbiAgICB0aGlzLmRpc3BhdGNoKFwicG9zdFwiLCBbbmFtZSwgbm9kZUFyZ3NdKS5mYWlsKGRlZmVycmVkLnJlamVjdCk7XG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG59O1xuXG4vKipcbiAqIElmIGEgZnVuY3Rpb24gd291bGQgbGlrZSB0byBzdXBwb3J0IGJvdGggTm9kZSBjb250aW51YXRpb24tcGFzc2luZy1zdHlsZSBhbmRcbiAqIHByb21pc2UtcmV0dXJuaW5nLXN0eWxlLCBpdCBjYW4gZW5kIGl0cyBpbnRlcm5hbCBwcm9taXNlIGNoYWluIHdpdGhcbiAqIGBub2RlaWZ5KG5vZGViYWNrKWAsIGZvcndhcmRpbmcgdGhlIG9wdGlvbmFsIG5vZGViYWNrIGFyZ3VtZW50LiAgSWYgdGhlIHVzZXJcbiAqIGVsZWN0cyB0byB1c2UgYSBub2RlYmFjaywgdGhlIHJlc3VsdCB3aWxsIGJlIHNlbnQgdGhlcmUuICBJZiB0aGV5IGRvIG5vdFxuICogcGFzcyBhIG5vZGViYWNrLCB0aGV5IHdpbGwgcmVjZWl2ZSB0aGUgcmVzdWx0IHByb21pc2UuXG4gKiBAcGFyYW0gb2JqZWN0IGEgcmVzdWx0IChvciBhIHByb21pc2UgZm9yIGEgcmVzdWx0KVxuICogQHBhcmFtIHtGdW5jdGlvbn0gbm9kZWJhY2sgYSBOb2RlLmpzLXN0eWxlIGNhbGxiYWNrXG4gKiBAcmV0dXJucyBlaXRoZXIgdGhlIHByb21pc2Ugb3Igbm90aGluZ1xuICovXG5RLm5vZGVpZnkgPSBub2RlaWZ5O1xuZnVuY3Rpb24gbm9kZWlmeShvYmplY3QsIG5vZGViYWNrKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5ub2RlaWZ5KG5vZGViYWNrKTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUubm9kZWlmeSA9IGZ1bmN0aW9uIChub2RlYmFjaykge1xuICAgIGlmIChub2RlYmFjaykge1xuICAgICAgICB0aGlzLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICBuZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgbm9kZWJhY2sobnVsbCwgdmFsdWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgbmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIG5vZGViYWNrKGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG59O1xuXG4vLyBBbGwgY29kZSBiZWZvcmUgdGhpcyBwb2ludCB3aWxsIGJlIGZpbHRlcmVkIGZyb20gc3RhY2sgdHJhY2VzLlxudmFyIHFFbmRpbmdMaW5lID0gY2FwdHVyZUxpbmUoKTtcblxucmV0dXJuIFE7XG5cbn0pO1xuIiwiLyoqXG4gKiBxc3RhcnQuanMgLSBET00gcmVhZHkgcHJvbWlzaWZpZWQgd2l0aCBRXG4gKi9cblxuKGZ1bmN0aW9uIChkZWZpbml0aW9uKSB7XG4gICAgaWYgKHR5cGVvZiBleHBvcnRzID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZGVmaW5pdGlvbigpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIFFzdGFydCA9IGRlZmluaXRpb24oKTtcbiAgICB9XG5cbn0pKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgUSA9IHdpbmRvdy5RIHx8IHJlcXVpcmUoJ3EnKSxcbiAgICAgICAgZCA9IFEuZGVmZXIoKSxcbiAgICAgICAgc3VjY2Vzc8aSID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCBlcnJvcsaSKTtcbiAgICAgICAgICAgIGQucmVzb2x2ZSh3aW5kb3cuZG9jdW1lbnQpO1xuICAgICAgICB9LFxuICAgICAgICBlcnJvcsaSID0gZnVuY3Rpb24gKGVycikgeyBkLnJlamVjdChlcnIpOyB9O1xuXG4gICAgd2luZG93LmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJyZWFkeXN0YXRlY2hhbmdlXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKGRvY3VtZW50LnJlYWR5U3RhdGUgPT0gXCJjb21wbGV0ZVwiKSBzdWNjZXNzxpIoKTtcbiAgICB9LCBmYWxzZSk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCBlcnJvcsaSLCBmYWxzZSk7XG4gICAgcmV0dXJuIGQucHJvbWlzZTtcbn0pO1xuIiwiLyoqXG4gKiBtYXNrLmpzIC0gYSBkZWFkIHNpbXBsZSBtYXNrXG4gKi9cblxuKGZ1bmN0aW9uIChkZWZpbml0aW9uKSB7XG4gICAgaWYgKHR5cGVvZiBleHBvcnRzID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZGVmaW5pdGlvbigpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIE1hc2sgPSBkZWZpbml0aW9uKCk7XG4gICAgfVxuXG59KShmdW5jdGlvbiAoKSB7XG5cbiAgICBmdW5jdGlvbiBzZXREZWZhdWx0U3R5bGUoZWwsIHN0eWxlKSB7XG4gICAgICAgIGZvciAodmFyIGF0dHIgaW4gc3R5bGUpIGVsLnN0eWxlW2F0dHJdID0gc3R5bGVbYXR0cl07XG4gICAgfVxuXG4gICAgdmFyIG9uID0gKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYoXCJhZGRFdmVudExpc3RlbmVyXCIgaW4gd2luZG93KSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGVsLCBldnQsIGZuLCBidWJibGUpIHtcbiAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2dCwgZm4sIGJ1YmJsZSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYoXCJhdHRhY2hFdmVudFwiIGluIHdpbmRvdykge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChlbCwgZXZ0LCBmbiwgYnViYmxlKSB7XG4gICAgICAgICAgICAgICAgZWwuYXR0YWNoRXZlbnQoXCJvblwiICsgZXZ0LCBmbik7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfSgpKTtcblxuICAgIHZhciBvZmYgPSAoZnVuY3Rpb24gKCkge1xuICAgICAgICBpZihcInJlbW92ZUV2ZW50TGlzdGVuZXJcIiBpbiB3aW5kb3cpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbiAoZWwsIGV2dCwgZm4pIHtcbiAgICAgICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2dCwgZm4pO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmKFwiZGV0YWNoRXZlbnRcIiBpbiB3aW5kb3cpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbiAoZWwsIGV2dCwgZm4pIHtcbiAgICAgICAgICAgICAgICBlbC5kZXRhY2hFdmVudChcIm9uXCIgKyBldnQsIGZuKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9KCkpO1xuXG4gICAgZnVuY3Rpb24gc2V0U3R5bGUoYXR0ciwgdmFsKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZWwpIHtcbiAgICAgICAgICAgIHJldHVybiBRYW5pbWF0aW9uRnJhbWUoZWwpLnRoZW4oZnVuY3Rpb24gKGVsKSB7XG4gICAgICAgICAgICAgICAgZWwuc3R5bGVbYXR0cl0gPSB2YWw7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGVsO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gWm9wYWNpdHlmKHZpc2libGUsIGQpIHtcbiAgICAgICAgcmV0dXJuIFphbmltby50cmFuc2l0aW9uZignb3BhY2l0eScsIHZpc2libGUgPyAwLjUgOiAwLCBkLCAnZWFzZS1pbi1vdXQnKTtcbiAgICB9XG5cbiAgICB2YXIgUSA9IHdpbmRvdy5RIHx8IHJlcXVpcmUoJ3EnKSxcbiAgICAgICAgWmFuaW1vID0gd2luZG93LlphbmltbyB8fCByZXF1aXJlKCd6YW5pbW8nKSxcbiAgICAgICAgUWFuaW1hdGlvbkZyYW1lID0gd2luZG93LlFhbmltYXRpb25GcmFtZSB8fCByZXF1aXJlKCdxYW5pbWF0aW9uZnJhbWUnKSxcbiAgICAgICAgaW5wdXRFdmVudCA9IHdpbmRvdy5kb2N1bWVudC5vbnRvdWNoc3RhcnQgPT09IG51bGwgPyBcInRvdWNoc3RhcnRcIjogXCJjbGlja1wiLFxuICAgICAgICBNYXNrID0ge30sXG4gICAgICAgIGRlZmF1bHRTdHlsZSA9IHtcbiAgICAgICAgICAgIHdpZHRoIDogJzEwMCUnLFxuICAgICAgICAgICAgaGVpZ2h0IDogJzEwMCUnLFxuICAgICAgICAgICAgcG9zaXRpb24gOiAnYWJzb2x1dGUnLFxuICAgICAgICAgICAgdG9wIDogMCxcbiAgICAgICAgICAgIGxlZnQgOiAwLFxuICAgICAgICAgICAgb3BhY2l0eSA6IDAsXG4gICAgICAgICAgICBkaXNwbGF5IDogJ25vbmUnLFxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yIDogJ2JsYWNrJyxcbiAgICAgICAgICAgIHpJbmRleCA6IDEwXG4gICAgICAgIH0sXG4gICAgICAgIGR1cmF0aW9uID0gNTAwLFxuICAgICAgICBpbml0aWFsaXplZCA9IGZhbHNlLFxuICAgICAgICBkaXNwbGF5ZWQgPSBmYWxzZSxcbiAgICAgICAgYW5pbWF0ZWQgPSBmYWxzZSxcbiAgICAgICAgdHJhbnNpdGlvbmYgPSBab3BhY2l0eWYsXG4gICAgICAgIGVsID0gbnVsbDtcblxuICAgIE1hc2suaW5pdCA9IGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICAgICAgaWYgKGluaXRpYWxpemVkKSByZXR1cm47XG4gICAgICAgIGVsID0gd2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG4gICAgICAgIGlmIChjb25maWcpIHtcbiAgICAgICAgICAgIGlmIChjb25maWcuaWQpIGVsLmlkID0gY29uZmlnLmlkO1xuICAgICAgICAgICAgaWYgKGNvbmZpZy5iYWNrZ3JvdW5kQ29sb3IpXG4gICAgICAgICAgICAgICAgZGVmYXVsdFN0eWxlLmJhY2tncm91bmRDb2xvciA9IGNvbmZpZy5iYWNrZ3JvdW5kQ29sb3I7XG4gICAgICAgICAgICBpZiAoY29uZmlnLmR1cmF0aW9uKSBkdXJhdGlvbiA9IGNvbmZpZy5kdXJhdGlvbjtcbiAgICAgICAgICAgIGlmIChjb25maWcudHJhbnNpdGlvbmYpIHRyYW5zaXRpb25mID0gY29uZmlnLnRyYW5zaXRpb25mO1xuICAgICAgICAgICAgaWYgKGNvbmZpZy56SW5kZXgpIGRlZmF1bHRTdHlsZS56SW5kZXggPSBjb25maWcuekluZGV4O1xuICAgICAgICB9XG5cbiAgICAgICAgc2V0RGVmYXVsdFN0eWxlKGVsLCBkZWZhdWx0U3R5bGUpO1xuICAgICAgICB3aW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlbCk7XG4gICAgICAgIGluaXRpYWxpemVkID0gdHJ1ZTtcbiAgICB9O1xuXG4gICAgTWFzay5zdHlsZSA9IGZ1bmN0aW9uIChzdHlsZSkgeyBzZXREZWZhdWx0U3R5bGUoZWwsIHN0eWxlKTsgfTtcblxuICAgIE1hc2suc2hvdyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYoIWluaXRpYWxpemVkKSByZXR1cm4gUS5yZWplY3QoXCJNYXNrIGlzIG5vdCBpbml0aWFsaXplZCFcIik7XG4gICAgICAgIGlmKGFuaW1hdGVkKSByZXR1cm4gUS5yZWplY3QoXCJNYXNrIGlzIGluIHVzZSFcIik7XG4gICAgICAgIGlmKGRpc3BsYXllZCkgcmV0dXJuIFEucmVqZWN0KFwiTWFzayBpcyBhbHJlYWR5IGRpc3BsYXllZCFcIik7XG4gICAgICAgIGFuaW1hdGVkID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIFphbmltbyhlbClcbiAgICAgICAgICAgIC50aGVuKHNldFN0eWxlKCdkaXNwbGF5JywgJ2Jsb2NrJykpXG4gICAgICAgICAgICAudGhlbih0cmFuc2l0aW9uZih0cnVlLCBkdXJhdGlvbikpXG4gICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoZWwpIHtcbiAgICAgICAgICAgICAgICBvbihlbCwgaW5wdXRFdmVudCwgTWFzay5mKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZWw7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmZpbihmdW5jdGlvbihlbCkge1xuICAgICAgICAgICAgICAgIGRpc3BsYXllZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgYW5pbWF0ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZWw7XG4gICAgICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgTWFzay5oaWRlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZighaW5pdGlhbGl6ZWQpIHJldHVybiBRLnJlamVjdChcIk1hc2sgaXMgbm90IGluaXRpYWxpemVkIVwiKTtcbiAgICAgICAgaWYoYW5pbWF0ZWQpIHJldHVybiBRLnJlamVjdChcIk1hc2sgaXMgaW4gdXNlIVwiKTtcbiAgICAgICAgaWYoIWRpc3BsYXllZCkgcmV0dXJuIFEucmVqZWN0KFwiTWFzayBpcyBhbHJlYWR5IGhpZGRlbiFcIik7XG4gICAgICAgIGFuaW1hdGVkID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIFphbmltbyhlbClcbiAgICAgICAgICAgIC50aGVuKHRyYW5zaXRpb25mKGZhbHNlLCBkdXJhdGlvbikpXG4gICAgICAgICAgICAudGhlbihzZXRTdHlsZSgnZGlzcGxheScsICdub25lJykpXG4gICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoZWwpIHtcbiAgICAgICAgICAgICAgICBvZmYoZWwsIGlucHV0RXZlbnQsIE1hc2suZik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGVsO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5maW4oZnVuY3Rpb24oZWwpIHtcbiAgICAgICAgICAgICAgICBkaXNwbGF5ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBhbmltYXRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybiBlbDtcbiAgICAgICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBNYXNrLm9uVG91Y2ggPSBmdW5jdGlvbihmKSB7IE1hc2suZiA9IGY7IH07XG5cbiAgICByZXR1cm4gTWFzaztcbn0pO1xuIiwidmFyIHByb2Nlc3M9cmVxdWlyZShcIl9fYnJvd3NlcmlmeV9wcm9jZXNzXCIpOy8vIHZpbTp0cz00OnN0cz00OnN3PTQ6XG4vKiFcbiAqXG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEyIEtyaXMgS293YWwgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBNSVRcbiAqIGxpY2Vuc2UgZm91bmQgYXQgaHR0cDovL2dpdGh1Yi5jb20va3Jpc2tvd2FsL3EvcmF3L21hc3Rlci9MSUNFTlNFXG4gKlxuICogV2l0aCBwYXJ0cyBieSBUeWxlciBDbG9zZVxuICogQ29weXJpZ2h0IDIwMDctMjAwOSBUeWxlciBDbG9zZSB1bmRlciB0aGUgdGVybXMgb2YgdGhlIE1JVCBYIGxpY2Vuc2UgZm91bmRcbiAqIGF0IGh0dHA6Ly93d3cub3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvbWl0LWxpY2Vuc2UuaHRtbFxuICogRm9ya2VkIGF0IHJlZl9zZW5kLmpzIHZlcnNpb246IDIwMDktMDUtMTFcbiAqXG4gKiBXaXRoIHBhcnRzIGJ5IE1hcmsgTWlsbGVyXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTEgR29vZ2xlIEluYy5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqXG4gKi9cblxuKGZ1bmN0aW9uIChkZWZpbml0aW9uKSB7XG4gICAgLy8gVHVybiBvZmYgc3RyaWN0IG1vZGUgZm9yIHRoaXMgZnVuY3Rpb24gc28gd2UgY2FuIGFzc2lnbiB0byBnbG9iYWwuUVxuICAgIC8qIGpzaGludCBzdHJpY3Q6IGZhbHNlICovXG5cbiAgICAvLyBUaGlzIGZpbGUgd2lsbCBmdW5jdGlvbiBwcm9wZXJseSBhcyBhIDxzY3JpcHQ+IHRhZywgb3IgYSBtb2R1bGVcbiAgICAvLyB1c2luZyBDb21tb25KUyBhbmQgTm9kZUpTIG9yIFJlcXVpcmVKUyBtb2R1bGUgZm9ybWF0cy4gIEluXG4gICAgLy8gQ29tbW9uL05vZGUvUmVxdWlyZUpTLCB0aGUgbW9kdWxlIGV4cG9ydHMgdGhlIFEgQVBJIGFuZCB3aGVuXG4gICAgLy8gZXhlY3V0ZWQgYXMgYSBzaW1wbGUgPHNjcmlwdD4sIGl0IGNyZWF0ZXMgYSBRIGdsb2JhbCBpbnN0ZWFkLlxuXG4gICAgLy8gTW9udGFnZSBSZXF1aXJlXG4gICAgaWYgKHR5cGVvZiBib290c3RyYXAgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICBib290c3RyYXAoXCJwcm9taXNlXCIsIGRlZmluaXRpb24pO1xuXG4gICAgLy8gQ29tbW9uSlNcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZGVmaW5pdGlvbigpO1xuXG4gICAgLy8gUmVxdWlyZUpTXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgICBkZWZpbmUoZGVmaW5pdGlvbik7XG5cbiAgICAvLyBTRVMgKFNlY3VyZSBFY21hU2NyaXB0KVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIHNlcyAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICBpZiAoIXNlcy5vaygpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZXMubWFrZVEgPSBkZWZpbml0aW9uO1xuICAgICAgICB9XG5cbiAgICAvLyA8c2NyaXB0PlxuICAgIH0gZWxzZSB7XG4gICAgICAgIFEgPSBkZWZpbml0aW9uKCk7XG4gICAgfVxuXG59KShmdW5jdGlvbiAoKSB7XG5cInVzZSBzdHJpY3RcIjtcblxudmFyIGhhc1N0YWNrcyA9IGZhbHNlO1xudHJ5IHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoKTtcbn0gY2F0Y2ggKGUpIHtcbiAgICBoYXNTdGFja3MgPSAhIWUuc3RhY2s7XG59XG5cbi8vIEFsbCBjb2RlIGFmdGVyIHRoaXMgcG9pbnQgd2lsbCBiZSBmaWx0ZXJlZCBmcm9tIHN0YWNrIHRyYWNlcyByZXBvcnRlZFxuLy8gYnkgUS5cbnZhciBxU3RhcnRpbmdMaW5lID0gY2FwdHVyZUxpbmUoKTtcbnZhciBxRmlsZU5hbWU7XG5cbi8vIHNoaW1zXG5cbi8vIHVzZWQgZm9yIGZhbGxiYWNrIGluIFwiYWxsUmVzb2x2ZWRcIlxudmFyIG5vb3AgPSBmdW5jdGlvbiAoKSB7fTtcblxuLy8gVXNlIHRoZSBmYXN0ZXN0IHBvc3NpYmxlIG1lYW5zIHRvIGV4ZWN1dGUgYSB0YXNrIGluIGEgZnV0dXJlIHR1cm5cbi8vIG9mIHRoZSBldmVudCBsb29wLlxudmFyIG5leHRUaWNrID0oZnVuY3Rpb24gKCkge1xuICAgIC8vIGxpbmtlZCBsaXN0IG9mIHRhc2tzIChzaW5nbGUsIHdpdGggaGVhZCBub2RlKVxuICAgIHZhciBoZWFkID0ge3Rhc2s6IHZvaWQgMCwgbmV4dDogbnVsbH07XG4gICAgdmFyIHRhaWwgPSBoZWFkO1xuICAgIHZhciBmbHVzaGluZyA9IGZhbHNlO1xuICAgIHZhciByZXF1ZXN0VGljayA9IHZvaWQgMDtcbiAgICB2YXIgaXNOb2RlSlMgPSBmYWxzZTtcblxuICAgIGZ1bmN0aW9uIGZsdXNoKCkge1xuICAgICAgICAvKiBqc2hpbnQgbG9vcGZ1bmM6IHRydWUgKi9cblxuICAgICAgICB3aGlsZSAoaGVhZC5uZXh0KSB7XG4gICAgICAgICAgICBoZWFkID0gaGVhZC5uZXh0O1xuICAgICAgICAgICAgdmFyIHRhc2sgPSBoZWFkLnRhc2s7XG4gICAgICAgICAgICBoZWFkLnRhc2sgPSB2b2lkIDA7XG4gICAgICAgICAgICB2YXIgZG9tYWluID0gaGVhZC5kb21haW47XG5cbiAgICAgICAgICAgIGlmIChkb21haW4pIHtcbiAgICAgICAgICAgICAgICBoZWFkLmRvbWFpbiA9IHZvaWQgMDtcbiAgICAgICAgICAgICAgICBkb21haW4uZW50ZXIoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB0YXNrKCk7XG5cbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNOb2RlSlMpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSW4gbm9kZSwgdW5jYXVnaHQgZXhjZXB0aW9ucyBhcmUgY29uc2lkZXJlZCBmYXRhbCBlcnJvcnMuXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlLXRocm93IHRoZW0gc3luY2hyb25vdXNseSB0byBpbnRlcnJ1cHQgZmx1c2hpbmchXG5cbiAgICAgICAgICAgICAgICAgICAgLy8gRW5zdXJlIGNvbnRpbnVhdGlvbiBpZiB0aGUgdW5jYXVnaHQgZXhjZXB0aW9uIGlzIHN1cHByZXNzZWRcbiAgICAgICAgICAgICAgICAgICAgLy8gbGlzdGVuaW5nIFwidW5jYXVnaHRFeGNlcHRpb25cIiBldmVudHMgKGFzIGRvbWFpbnMgZG9lcykuXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbnRpbnVlIGluIG5leHQgZXZlbnQgdG8gYXZvaWQgdGljayByZWN1cnNpb24uXG4gICAgICAgICAgICAgICAgICAgIGlmIChkb21haW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvbWFpbi5leGl0KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChmbHVzaCwgMCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkb21haW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvbWFpbi5lbnRlcigpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgZTtcblxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEluIGJyb3dzZXJzLCB1bmNhdWdodCBleGNlcHRpb25zIGFyZSBub3QgZmF0YWwuXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlLXRocm93IHRoZW0gYXN5bmNocm9ub3VzbHkgdG8gYXZvaWQgc2xvdy1kb3ducy5cbiAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZG9tYWluKSB7XG4gICAgICAgICAgICAgICAgZG9tYWluLmV4aXQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZsdXNoaW5nID0gZmFsc2U7XG4gICAgfVxuXG4gICAgbmV4dFRpY2sgPSBmdW5jdGlvbiAodGFzaykge1xuICAgICAgICB0YWlsID0gdGFpbC5uZXh0ID0ge1xuICAgICAgICAgICAgdGFzazogdGFzayxcbiAgICAgICAgICAgIGRvbWFpbjogaXNOb2RlSlMgJiYgcHJvY2Vzcy5kb21haW4sXG4gICAgICAgICAgICBuZXh0OiBudWxsXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKCFmbHVzaGluZykge1xuICAgICAgICAgICAgZmx1c2hpbmcgPSB0cnVlO1xuICAgICAgICAgICAgcmVxdWVzdFRpY2soKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBpZiAodHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgcHJvY2Vzcy5uZXh0VGljaykge1xuICAgICAgICAvLyBOb2RlLmpzIGJlZm9yZSAwLjkuIE5vdGUgdGhhdCBzb21lIGZha2UtTm9kZSBlbnZpcm9ubWVudHMsIGxpa2UgdGhlXG4gICAgICAgIC8vIE1vY2hhIHRlc3QgcnVubmVyLCBpbnRyb2R1Y2UgYSBgcHJvY2Vzc2AgZ2xvYmFsIHdpdGhvdXQgYSBgbmV4dFRpY2tgLlxuICAgICAgICBpc05vZGVKUyA9IHRydWU7XG5cbiAgICAgICAgcmVxdWVzdFRpY2sgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKGZsdXNoKTtcbiAgICAgICAgfTtcblxuICAgIH0gZWxzZSBpZiAodHlwZW9mIHNldEltbWVkaWF0ZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIC8vIEluIElFMTAsIE5vZGUuanMgMC45Kywgb3IgaHR0cHM6Ly9naXRodWIuY29tL05vYmxlSlMvc2V0SW1tZWRpYXRlXG4gICAgICAgIGlmICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICByZXF1ZXN0VGljayA9IHNldEltbWVkaWF0ZS5iaW5kKHdpbmRvdywgZmx1c2gpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVxdWVzdFRpY2sgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2V0SW1tZWRpYXRlKGZsdXNoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgIH0gZWxzZSBpZiAodHlwZW9mIE1lc3NhZ2VDaGFubmVsICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIC8vIG1vZGVybiBicm93c2Vyc1xuICAgICAgICAvLyBodHRwOi8vd3d3Lm5vbmJsb2NraW5nLmlvLzIwMTEvMDYvd2luZG93bmV4dHRpY2suaHRtbFxuICAgICAgICB2YXIgY2hhbm5lbCA9IG5ldyBNZXNzYWdlQ2hhbm5lbCgpO1xuICAgICAgICAvLyBBdCBsZWFzdCBTYWZhcmkgVmVyc2lvbiA2LjAuNSAoODUzNi4zMC4xKSBpbnRlcm1pdHRlbnRseSBjYW5ub3QgY3JlYXRlXG4gICAgICAgIC8vIHdvcmtpbmcgbWVzc2FnZSBwb3J0cyB0aGUgZmlyc3QgdGltZSBhIHBhZ2UgbG9hZHMuXG4gICAgICAgIGNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmVxdWVzdFRpY2sgPSByZXF1ZXN0UG9ydFRpY2s7XG4gICAgICAgICAgICBjaGFubmVsLnBvcnQxLm9ubWVzc2FnZSA9IGZsdXNoO1xuICAgICAgICAgICAgZmx1c2goKTtcbiAgICAgICAgfTtcbiAgICAgICAgdmFyIHJlcXVlc3RQb3J0VGljayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIC8vIE9wZXJhIHJlcXVpcmVzIHVzIHRvIHByb3ZpZGUgYSBtZXNzYWdlIHBheWxvYWQsIHJlZ2FyZGxlc3Mgb2ZcbiAgICAgICAgICAgIC8vIHdoZXRoZXIgd2UgdXNlIGl0LlxuICAgICAgICAgICAgY2hhbm5lbC5wb3J0Mi5wb3N0TWVzc2FnZSgwKTtcbiAgICAgICAgfTtcbiAgICAgICAgcmVxdWVzdFRpY2sgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KGZsdXNoLCAwKTtcbiAgICAgICAgICAgIHJlcXVlc3RQb3J0VGljaygpO1xuICAgICAgICB9O1xuXG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gb2xkIGJyb3dzZXJzXG4gICAgICAgIHJlcXVlc3RUaWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2V0VGltZW91dChmbHVzaCwgMCk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIG5leHRUaWNrO1xufSkoKTtcblxuLy8gQXR0ZW1wdCB0byBtYWtlIGdlbmVyaWNzIHNhZmUgaW4gdGhlIGZhY2Ugb2YgZG93bnN0cmVhbVxuLy8gbW9kaWZpY2F0aW9ucy5cbi8vIFRoZXJlIGlzIG5vIHNpdHVhdGlvbiB3aGVyZSB0aGlzIGlzIG5lY2Vzc2FyeS5cbi8vIElmIHlvdSBuZWVkIGEgc2VjdXJpdHkgZ3VhcmFudGVlLCB0aGVzZSBwcmltb3JkaWFscyBuZWVkIHRvIGJlXG4vLyBkZWVwbHkgZnJvemVuIGFueXdheSwgYW5kIGlmIHlvdSBkb27igJl0IG5lZWQgYSBzZWN1cml0eSBndWFyYW50ZWUsXG4vLyB0aGlzIGlzIGp1c3QgcGxhaW4gcGFyYW5vaWQuXG4vLyBIb3dldmVyLCB0aGlzIGRvZXMgaGF2ZSB0aGUgbmljZSBzaWRlLWVmZmVjdCBvZiByZWR1Y2luZyB0aGUgc2l6ZVxuLy8gb2YgdGhlIGNvZGUgYnkgcmVkdWNpbmcgeC5jYWxsKCkgdG8gbWVyZWx5IHgoKSwgZWxpbWluYXRpbmcgbWFueVxuLy8gaGFyZC10by1taW5pZnkgY2hhcmFjdGVycy5cbi8vIFNlZSBNYXJrIE1pbGxlcuKAmXMgZXhwbGFuYXRpb24gb2Ygd2hhdCB0aGlzIGRvZXMuXG4vLyBodHRwOi8vd2lraS5lY21hc2NyaXB0Lm9yZy9kb2t1LnBocD9pZD1jb252ZW50aW9uczpzYWZlX21ldGFfcHJvZ3JhbW1pbmdcbnZhciBjYWxsID0gRnVuY3Rpb24uY2FsbDtcbmZ1bmN0aW9uIHVuY3VycnlUaGlzKGYpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gY2FsbC5hcHBseShmLCBhcmd1bWVudHMpO1xuICAgIH07XG59XG4vLyBUaGlzIGlzIGVxdWl2YWxlbnQsIGJ1dCBzbG93ZXI6XG4vLyB1bmN1cnJ5VGhpcyA9IEZ1bmN0aW9uX2JpbmQuYmluZChGdW5jdGlvbl9iaW5kLmNhbGwpO1xuLy8gaHR0cDovL2pzcGVyZi5jb20vdW5jdXJyeXRoaXNcblxudmFyIGFycmF5X3NsaWNlID0gdW5jdXJyeVRoaXMoQXJyYXkucHJvdG90eXBlLnNsaWNlKTtcblxudmFyIGFycmF5X3JlZHVjZSA9IHVuY3VycnlUaGlzKFxuICAgIEFycmF5LnByb3RvdHlwZS5yZWR1Y2UgfHwgZnVuY3Rpb24gKGNhbGxiYWNrLCBiYXNpcykge1xuICAgICAgICB2YXIgaW5kZXggPSAwLFxuICAgICAgICAgICAgbGVuZ3RoID0gdGhpcy5sZW5ndGg7XG4gICAgICAgIC8vIGNvbmNlcm5pbmcgdGhlIGluaXRpYWwgdmFsdWUsIGlmIG9uZSBpcyBub3QgcHJvdmlkZWRcbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIC8vIHNlZWsgdG8gdGhlIGZpcnN0IHZhbHVlIGluIHRoZSBhcnJheSwgYWNjb3VudGluZ1xuICAgICAgICAgICAgLy8gZm9yIHRoZSBwb3NzaWJpbGl0eSB0aGF0IGlzIGlzIGEgc3BhcnNlIGFycmF5XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgaWYgKGluZGV4IGluIHRoaXMpIHtcbiAgICAgICAgICAgICAgICAgICAgYmFzaXMgPSB0aGlzW2luZGV4KytdO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCsraW5kZXggPj0gbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IHdoaWxlICgxKTtcbiAgICAgICAgfVxuICAgICAgICAvLyByZWR1Y2VcbiAgICAgICAgZm9yICg7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgICAgICAvLyBhY2NvdW50IGZvciB0aGUgcG9zc2liaWxpdHkgdGhhdCB0aGUgYXJyYXkgaXMgc3BhcnNlXG4gICAgICAgICAgICBpZiAoaW5kZXggaW4gdGhpcykge1xuICAgICAgICAgICAgICAgIGJhc2lzID0gY2FsbGJhY2soYmFzaXMsIHRoaXNbaW5kZXhdLCBpbmRleCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGJhc2lzO1xuICAgIH1cbik7XG5cbnZhciBhcnJheV9pbmRleE9mID0gdW5jdXJyeVRoaXMoXG4gICAgQXJyYXkucHJvdG90eXBlLmluZGV4T2YgfHwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIC8vIG5vdCBhIHZlcnkgZ29vZCBzaGltLCBidXQgZ29vZCBlbm91Z2ggZm9yIG91ciBvbmUgdXNlIG9mIGl0XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXNbaV0gPT09IHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIC0xO1xuICAgIH1cbik7XG5cbnZhciBhcnJheV9tYXAgPSB1bmN1cnJ5VGhpcyhcbiAgICBBcnJheS5wcm90b3R5cGUubWFwIHx8IGZ1bmN0aW9uIChjYWxsYmFjaywgdGhpc3ApIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgY29sbGVjdCA9IFtdO1xuICAgICAgICBhcnJheV9yZWR1Y2Uoc2VsZiwgZnVuY3Rpb24gKHVuZGVmaW5lZCwgdmFsdWUsIGluZGV4KSB7XG4gICAgICAgICAgICBjb2xsZWN0LnB1c2goY2FsbGJhY2suY2FsbCh0aGlzcCwgdmFsdWUsIGluZGV4LCBzZWxmKSk7XG4gICAgICAgIH0sIHZvaWQgMCk7XG4gICAgICAgIHJldHVybiBjb2xsZWN0O1xuICAgIH1cbik7XG5cbnZhciBvYmplY3RfY3JlYXRlID0gT2JqZWN0LmNyZWF0ZSB8fCBmdW5jdGlvbiAocHJvdG90eXBlKSB7XG4gICAgZnVuY3Rpb24gVHlwZSgpIHsgfVxuICAgIFR5cGUucHJvdG90eXBlID0gcHJvdG90eXBlO1xuICAgIHJldHVybiBuZXcgVHlwZSgpO1xufTtcblxudmFyIG9iamVjdF9oYXNPd25Qcm9wZXJ0eSA9IHVuY3VycnlUaGlzKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkpO1xuXG52YXIgb2JqZWN0X2tleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgdmFyIGtleXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqZWN0KSB7XG4gICAgICAgIGlmIChvYmplY3RfaGFzT3duUHJvcGVydHkob2JqZWN0LCBrZXkpKSB7XG4gICAgICAgICAgICBrZXlzLnB1c2goa2V5KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ga2V5cztcbn07XG5cbnZhciBvYmplY3RfdG9TdHJpbmcgPSB1bmN1cnJ5VGhpcyhPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nKTtcblxuZnVuY3Rpb24gaXNPYmplY3QodmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWUgPT09IE9iamVjdCh2YWx1ZSk7XG59XG5cbi8vIGdlbmVyYXRvciByZWxhdGVkIHNoaW1zXG5cbi8vIEZJWE1FOiBSZW1vdmUgdGhpcyBmdW5jdGlvbiBvbmNlIEVTNiBnZW5lcmF0b3JzIGFyZSBpbiBTcGlkZXJNb25rZXkuXG5mdW5jdGlvbiBpc1N0b3BJdGVyYXRpb24oZXhjZXB0aW9uKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgb2JqZWN0X3RvU3RyaW5nKGV4Y2VwdGlvbikgPT09IFwiW29iamVjdCBTdG9wSXRlcmF0aW9uXVwiIHx8XG4gICAgICAgIGV4Y2VwdGlvbiBpbnN0YW5jZW9mIFFSZXR1cm5WYWx1ZVxuICAgICk7XG59XG5cbi8vIEZJWE1FOiBSZW1vdmUgdGhpcyBoZWxwZXIgYW5kIFEucmV0dXJuIG9uY2UgRVM2IGdlbmVyYXRvcnMgYXJlIGluXG4vLyBTcGlkZXJNb25rZXkuXG52YXIgUVJldHVyblZhbHVlO1xuaWYgKHR5cGVvZiBSZXR1cm5WYWx1ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIFFSZXR1cm5WYWx1ZSA9IFJldHVyblZhbHVlO1xufSBlbHNlIHtcbiAgICBRUmV0dXJuVmFsdWUgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgdGhpcy52YWx1ZSA9IHZhbHVlO1xuICAgIH07XG59XG5cbi8vIFVudGlsIFY4IDMuMTkgLyBDaHJvbWl1bSAyOSBpcyByZWxlYXNlZCwgU3BpZGVyTW9ua2V5IGlzIHRoZSBvbmx5XG4vLyBlbmdpbmUgdGhhdCBoYXMgYSBkZXBsb3llZCBiYXNlIG9mIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBnZW5lcmF0b3JzLlxuLy8gSG93ZXZlciwgU00ncyBnZW5lcmF0b3JzIHVzZSB0aGUgUHl0aG9uLWluc3BpcmVkIHNlbWFudGljcyBvZlxuLy8gb3V0ZGF0ZWQgRVM2IGRyYWZ0cy4gIFdlIHdvdWxkIGxpa2UgdG8gc3VwcG9ydCBFUzYsIGJ1dCB3ZSdkIGFsc29cbi8vIGxpa2UgdG8gbWFrZSBpdCBwb3NzaWJsZSB0byB1c2UgZ2VuZXJhdG9ycyBpbiBkZXBsb3llZCBicm93c2Vycywgc29cbi8vIHdlIGFsc28gc3VwcG9ydCBQeXRob24tc3R5bGUgZ2VuZXJhdG9ycy4gIEF0IHNvbWUgcG9pbnQgd2UgY2FuIHJlbW92ZVxuLy8gdGhpcyBibG9jay5cbnZhciBoYXNFUzZHZW5lcmF0b3JzO1xudHJ5IHtcbiAgICAvKiBqc2hpbnQgZXZpbDogdHJ1ZSwgbm9uZXc6IGZhbHNlICovXG4gICAgbmV3IEZ1bmN0aW9uKFwiKGZ1bmN0aW9uKiAoKXsgeWllbGQgMTsgfSlcIik7XG4gICAgaGFzRVM2R2VuZXJhdG9ycyA9IHRydWU7XG59IGNhdGNoIChlKSB7XG4gICAgaGFzRVM2R2VuZXJhdG9ycyA9IGZhbHNlO1xufVxuXG4vLyBsb25nIHN0YWNrIHRyYWNlc1xuXG52YXIgU1RBQ0tfSlVNUF9TRVBBUkFUT1IgPSBcIkZyb20gcHJldmlvdXMgZXZlbnQ6XCI7XG5cbmZ1bmN0aW9uIG1ha2VTdGFja1RyYWNlTG9uZyhlcnJvciwgcHJvbWlzZSkge1xuICAgIC8vIElmIHBvc3NpYmxlLCB0cmFuc2Zvcm0gdGhlIGVycm9yIHN0YWNrIHRyYWNlIGJ5IHJlbW92aW5nIE5vZGUgYW5kIFFcbiAgICAvLyBjcnVmdCwgdGhlbiBjb25jYXRlbmF0aW5nIHdpdGggdGhlIHN0YWNrIHRyYWNlIG9mIGBwcm9taXNlYC4gU2VlICM1Ny5cbiAgICBpZiAoaGFzU3RhY2tzICYmXG4gICAgICAgIHByb21pc2Uuc3RhY2sgJiZcbiAgICAgICAgdHlwZW9mIGVycm9yID09PSBcIm9iamVjdFwiICYmXG4gICAgICAgIGVycm9yICE9PSBudWxsICYmXG4gICAgICAgIGVycm9yLnN0YWNrICYmXG4gICAgICAgIGVycm9yLnN0YWNrLmluZGV4T2YoU1RBQ0tfSlVNUF9TRVBBUkFUT1IpID09PSAtMVxuICAgICkge1xuICAgICAgICB2YXIgc3RhY2tzID0gW107XG4gICAgICAgIGZvciAodmFyIHAgPSBwcm9taXNlOyAhIXA7IHAgPSBwLnNvdXJjZSkge1xuICAgICAgICAgICAgaWYgKHAuc3RhY2spIHtcbiAgICAgICAgICAgICAgICBzdGFja3MudW5zaGlmdChwLnN0YWNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBzdGFja3MudW5zaGlmdChlcnJvci5zdGFjayk7XG5cbiAgICAgICAgdmFyIGNvbmNhdGVkU3RhY2tzID0gc3RhY2tzLmpvaW4oXCJcXG5cIiArIFNUQUNLX0pVTVBfU0VQQVJBVE9SICsgXCJcXG5cIik7XG4gICAgICAgIGVycm9yLnN0YWNrID0gZmlsdGVyU3RhY2tTdHJpbmcoY29uY2F0ZWRTdGFja3MpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZmlsdGVyU3RhY2tTdHJpbmcoc3RhY2tTdHJpbmcpIHtcbiAgICB2YXIgbGluZXMgPSBzdGFja1N0cmluZy5zcGxpdChcIlxcblwiKTtcbiAgICB2YXIgZGVzaXJlZExpbmVzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgbGluZSA9IGxpbmVzW2ldO1xuXG4gICAgICAgIGlmICghaXNJbnRlcm5hbEZyYW1lKGxpbmUpICYmICFpc05vZGVGcmFtZShsaW5lKSAmJiBsaW5lKSB7XG4gICAgICAgICAgICBkZXNpcmVkTGluZXMucHVzaChsaW5lKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZGVzaXJlZExpbmVzLmpvaW4oXCJcXG5cIik7XG59XG5cbmZ1bmN0aW9uIGlzTm9kZUZyYW1lKHN0YWNrTGluZSkge1xuICAgIHJldHVybiBzdGFja0xpbmUuaW5kZXhPZihcIihtb2R1bGUuanM6XCIpICE9PSAtMSB8fFxuICAgICAgICAgICBzdGFja0xpbmUuaW5kZXhPZihcIihub2RlLmpzOlwiKSAhPT0gLTE7XG59XG5cbmZ1bmN0aW9uIGdldEZpbGVOYW1lQW5kTGluZU51bWJlcihzdGFja0xpbmUpIHtcbiAgICAvLyBOYW1lZCBmdW5jdGlvbnM6IFwiYXQgZnVuY3Rpb25OYW1lIChmaWxlbmFtZTpsaW5lTnVtYmVyOmNvbHVtbk51bWJlcilcIlxuICAgIC8vIEluIElFMTAgZnVuY3Rpb24gbmFtZSBjYW4gaGF2ZSBzcGFjZXMgKFwiQW5vbnltb3VzIGZ1bmN0aW9uXCIpIE9fb1xuICAgIHZhciBhdHRlbXB0MSA9IC9hdCAuKyBcXCgoLispOihcXGQrKTooPzpcXGQrKVxcKSQvLmV4ZWMoc3RhY2tMaW5lKTtcbiAgICBpZiAoYXR0ZW1wdDEpIHtcbiAgICAgICAgcmV0dXJuIFthdHRlbXB0MVsxXSwgTnVtYmVyKGF0dGVtcHQxWzJdKV07XG4gICAgfVxuXG4gICAgLy8gQW5vbnltb3VzIGZ1bmN0aW9uczogXCJhdCBmaWxlbmFtZTpsaW5lTnVtYmVyOmNvbHVtbk51bWJlclwiXG4gICAgdmFyIGF0dGVtcHQyID0gL2F0IChbXiBdKyk6KFxcZCspOig/OlxcZCspJC8uZXhlYyhzdGFja0xpbmUpO1xuICAgIGlmIChhdHRlbXB0Mikge1xuICAgICAgICByZXR1cm4gW2F0dGVtcHQyWzFdLCBOdW1iZXIoYXR0ZW1wdDJbMl0pXTtcbiAgICB9XG5cbiAgICAvLyBGaXJlZm94IHN0eWxlOiBcImZ1bmN0aW9uQGZpbGVuYW1lOmxpbmVOdW1iZXIgb3IgQGZpbGVuYW1lOmxpbmVOdW1iZXJcIlxuICAgIHZhciBhdHRlbXB0MyA9IC8uKkAoLispOihcXGQrKSQvLmV4ZWMoc3RhY2tMaW5lKTtcbiAgICBpZiAoYXR0ZW1wdDMpIHtcbiAgICAgICAgcmV0dXJuIFthdHRlbXB0M1sxXSwgTnVtYmVyKGF0dGVtcHQzWzJdKV07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBpc0ludGVybmFsRnJhbWUoc3RhY2tMaW5lKSB7XG4gICAgdmFyIGZpbGVOYW1lQW5kTGluZU51bWJlciA9IGdldEZpbGVOYW1lQW5kTGluZU51bWJlcihzdGFja0xpbmUpO1xuXG4gICAgaWYgKCFmaWxlTmFtZUFuZExpbmVOdW1iZXIpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHZhciBmaWxlTmFtZSA9IGZpbGVOYW1lQW5kTGluZU51bWJlclswXTtcbiAgICB2YXIgbGluZU51bWJlciA9IGZpbGVOYW1lQW5kTGluZU51bWJlclsxXTtcblxuICAgIHJldHVybiBmaWxlTmFtZSA9PT0gcUZpbGVOYW1lICYmXG4gICAgICAgIGxpbmVOdW1iZXIgPj0gcVN0YXJ0aW5nTGluZSAmJlxuICAgICAgICBsaW5lTnVtYmVyIDw9IHFFbmRpbmdMaW5lO1xufVxuXG4vLyBkaXNjb3ZlciBvd24gZmlsZSBuYW1lIGFuZCBsaW5lIG51bWJlciByYW5nZSBmb3IgZmlsdGVyaW5nIHN0YWNrXG4vLyB0cmFjZXNcbmZ1bmN0aW9uIGNhcHR1cmVMaW5lKCkge1xuICAgIGlmICghaGFzU3RhY2tzKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHZhciBsaW5lcyA9IGUuc3RhY2suc3BsaXQoXCJcXG5cIik7XG4gICAgICAgIHZhciBmaXJzdExpbmUgPSBsaW5lc1swXS5pbmRleE9mKFwiQFwiKSA+IDAgPyBsaW5lc1sxXSA6IGxpbmVzWzJdO1xuICAgICAgICB2YXIgZmlsZU5hbWVBbmRMaW5lTnVtYmVyID0gZ2V0RmlsZU5hbWVBbmRMaW5lTnVtYmVyKGZpcnN0TGluZSk7XG4gICAgICAgIGlmICghZmlsZU5hbWVBbmRMaW5lTnVtYmVyKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBxRmlsZU5hbWUgPSBmaWxlTmFtZUFuZExpbmVOdW1iZXJbMF07XG4gICAgICAgIHJldHVybiBmaWxlTmFtZUFuZExpbmVOdW1iZXJbMV07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkZXByZWNhdGUoY2FsbGJhY2ssIG5hbWUsIGFsdGVybmF0aXZlKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBjb25zb2xlICE9PSBcInVuZGVmaW5lZFwiICYmXG4gICAgICAgICAgICB0eXBlb2YgY29uc29sZS53YXJuID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihuYW1lICsgXCIgaXMgZGVwcmVjYXRlZCwgdXNlIFwiICsgYWx0ZXJuYXRpdmUgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIFwiIGluc3RlYWQuXCIsIG5ldyBFcnJvcihcIlwiKS5zdGFjayk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmFwcGx5KGNhbGxiYWNrLCBhcmd1bWVudHMpO1xuICAgIH07XG59XG5cbi8vIGVuZCBvZiBzaGltc1xuLy8gYmVnaW5uaW5nIG9mIHJlYWwgd29ya1xuXG4vKipcbiAqIENvbnN0cnVjdHMgYSBwcm9taXNlIGZvciBhbiBpbW1lZGlhdGUgcmVmZXJlbmNlLCBwYXNzZXMgcHJvbWlzZXMgdGhyb3VnaCwgb3JcbiAqIGNvZXJjZXMgcHJvbWlzZXMgZnJvbSBkaWZmZXJlbnQgc3lzdGVtcy5cbiAqIEBwYXJhbSB2YWx1ZSBpbW1lZGlhdGUgcmVmZXJlbmNlIG9yIHByb21pc2VcbiAqL1xuZnVuY3Rpb24gUSh2YWx1ZSkge1xuICAgIC8vIElmIHRoZSBvYmplY3QgaXMgYWxyZWFkeSBhIFByb21pc2UsIHJldHVybiBpdCBkaXJlY3RseS4gIFRoaXMgZW5hYmxlc1xuICAgIC8vIHRoZSByZXNvbHZlIGZ1bmN0aW9uIHRvIGJvdGggYmUgdXNlZCB0byBjcmVhdGVkIHJlZmVyZW5jZXMgZnJvbSBvYmplY3RzLFxuICAgIC8vIGJ1dCB0byB0b2xlcmFibHkgY29lcmNlIG5vbi1wcm9taXNlcyB0byBwcm9taXNlcy5cbiAgICBpZiAoaXNQcm9taXNlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgLy8gYXNzaW1pbGF0ZSB0aGVuYWJsZXNcbiAgICBpZiAoaXNQcm9taXNlQWxpa2UodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiBjb2VyY2UodmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmdWxmaWxsKHZhbHVlKTtcbiAgICB9XG59XG5RLnJlc29sdmUgPSBRO1xuXG4vKipcbiAqIFBlcmZvcm1zIGEgdGFzayBpbiBhIGZ1dHVyZSB0dXJuIG9mIHRoZSBldmVudCBsb29wLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gdGFza1xuICovXG5RLm5leHRUaWNrID0gbmV4dFRpY2s7XG5cbi8qKlxuICogQ29udHJvbHMgd2hldGhlciBvciBub3QgbG9uZyBzdGFjayB0cmFjZXMgd2lsbCBiZSBvblxuICovXG5RLmxvbmdTdGFja1N1cHBvcnQgPSBmYWxzZTtcblxuLyoqXG4gKiBDb25zdHJ1Y3RzIGEge3Byb21pc2UsIHJlc29sdmUsIHJlamVjdH0gb2JqZWN0LlxuICpcbiAqIGByZXNvbHZlYCBpcyBhIGNhbGxiYWNrIHRvIGludm9rZSB3aXRoIGEgbW9yZSByZXNvbHZlZCB2YWx1ZSBmb3IgdGhlXG4gKiBwcm9taXNlLiBUbyBmdWxmaWxsIHRoZSBwcm9taXNlLCBpbnZva2UgYHJlc29sdmVgIHdpdGggYW55IHZhbHVlIHRoYXQgaXNcbiAqIG5vdCBhIHRoZW5hYmxlLiBUbyByZWplY3QgdGhlIHByb21pc2UsIGludm9rZSBgcmVzb2x2ZWAgd2l0aCBhIHJlamVjdGVkXG4gKiB0aGVuYWJsZSwgb3IgaW52b2tlIGByZWplY3RgIHdpdGggdGhlIHJlYXNvbiBkaXJlY3RseS4gVG8gcmVzb2x2ZSB0aGVcbiAqIHByb21pc2UgdG8gYW5vdGhlciB0aGVuYWJsZSwgdGh1cyBwdXR0aW5nIGl0IGluIHRoZSBzYW1lIHN0YXRlLCBpbnZva2VcbiAqIGByZXNvbHZlYCB3aXRoIHRoYXQgb3RoZXIgdGhlbmFibGUuXG4gKi9cblEuZGVmZXIgPSBkZWZlcjtcbmZ1bmN0aW9uIGRlZmVyKCkge1xuICAgIC8vIGlmIFwibWVzc2FnZXNcIiBpcyBhbiBcIkFycmF5XCIsIHRoYXQgaW5kaWNhdGVzIHRoYXQgdGhlIHByb21pc2UgaGFzIG5vdCB5ZXRcbiAgICAvLyBiZWVuIHJlc29sdmVkLiAgSWYgaXQgaXMgXCJ1bmRlZmluZWRcIiwgaXQgaGFzIGJlZW4gcmVzb2x2ZWQuICBFYWNoXG4gICAgLy8gZWxlbWVudCBvZiB0aGUgbWVzc2FnZXMgYXJyYXkgaXMgaXRzZWxmIGFuIGFycmF5IG9mIGNvbXBsZXRlIGFyZ3VtZW50cyB0b1xuICAgIC8vIGZvcndhcmQgdG8gdGhlIHJlc29sdmVkIHByb21pc2UuICBXZSBjb2VyY2UgdGhlIHJlc29sdXRpb24gdmFsdWUgdG8gYVxuICAgIC8vIHByb21pc2UgdXNpbmcgdGhlIGByZXNvbHZlYCBmdW5jdGlvbiBiZWNhdXNlIGl0IGhhbmRsZXMgYm90aCBmdWxseVxuICAgIC8vIG5vbi10aGVuYWJsZSB2YWx1ZXMgYW5kIG90aGVyIHRoZW5hYmxlcyBncmFjZWZ1bGx5LlxuICAgIHZhciBtZXNzYWdlcyA9IFtdLCBwcm9ncmVzc0xpc3RlbmVycyA9IFtdLCByZXNvbHZlZFByb21pc2U7XG5cbiAgICB2YXIgZGVmZXJyZWQgPSBvYmplY3RfY3JlYXRlKGRlZmVyLnByb3RvdHlwZSk7XG4gICAgdmFyIHByb21pc2UgPSBvYmplY3RfY3JlYXRlKFByb21pc2UucHJvdG90eXBlKTtcblxuICAgIHByb21pc2UucHJvbWlzZURpc3BhdGNoID0gZnVuY3Rpb24gKHJlc29sdmUsIG9wLCBvcGVyYW5kcykge1xuICAgICAgICB2YXIgYXJncyA9IGFycmF5X3NsaWNlKGFyZ3VtZW50cyk7XG4gICAgICAgIGlmIChtZXNzYWdlcykge1xuICAgICAgICAgICAgbWVzc2FnZXMucHVzaChhcmdzKTtcbiAgICAgICAgICAgIGlmIChvcCA9PT0gXCJ3aGVuXCIgJiYgb3BlcmFuZHNbMV0pIHsgLy8gcHJvZ3Jlc3Mgb3BlcmFuZFxuICAgICAgICAgICAgICAgIHByb2dyZXNzTGlzdGVuZXJzLnB1c2gob3BlcmFuZHNbMV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJlc29sdmVkUHJvbWlzZS5wcm9taXNlRGlzcGF0Y2guYXBwbHkocmVzb2x2ZWRQcm9taXNlLCBhcmdzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vIFhYWCBkZXByZWNhdGVkXG4gICAgcHJvbWlzZS52YWx1ZU9mID0gZGVwcmVjYXRlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKG1lc3NhZ2VzKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgbmVhcmVyVmFsdWUgPSBuZWFyZXIocmVzb2x2ZWRQcm9taXNlKTtcbiAgICAgICAgaWYgKGlzUHJvbWlzZShuZWFyZXJWYWx1ZSkpIHtcbiAgICAgICAgICAgIHJlc29sdmVkUHJvbWlzZSA9IG5lYXJlclZhbHVlOyAvLyBzaG9ydGVuIGNoYWluXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5lYXJlclZhbHVlO1xuICAgIH0sIFwidmFsdWVPZlwiLCBcImluc3BlY3RcIik7XG5cbiAgICBwcm9taXNlLmluc3BlY3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghcmVzb2x2ZWRQcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdGF0ZTogXCJwZW5kaW5nXCIgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzb2x2ZWRQcm9taXNlLmluc3BlY3QoKTtcbiAgICB9O1xuXG4gICAgaWYgKFEubG9uZ1N0YWNrU3VwcG9ydCAmJiBoYXNTdGFja3MpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAvLyBOT1RFOiBkb24ndCB0cnkgdG8gdXNlIGBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZWAgb3IgdHJhbnNmZXIgdGhlXG4gICAgICAgICAgICAvLyBhY2Nlc3NvciBhcm91bmQ7IHRoYXQgY2F1c2VzIG1lbW9yeSBsZWFrcyBhcyBwZXIgR0gtMTExLiBKdXN0XG4gICAgICAgICAgICAvLyByZWlmeSB0aGUgc3RhY2sgdHJhY2UgYXMgYSBzdHJpbmcgQVNBUC5cbiAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAvLyBBdCB0aGUgc2FtZSB0aW1lLCBjdXQgb2ZmIHRoZSBmaXJzdCBsaW5lOyBpdCdzIGFsd2F5cyBqdXN0XG4gICAgICAgICAgICAvLyBcIltvYmplY3QgUHJvbWlzZV1cXG5cIiwgYXMgcGVyIHRoZSBgdG9TdHJpbmdgLlxuICAgICAgICAgICAgcHJvbWlzZS5zdGFjayA9IGUuc3RhY2suc3Vic3RyaW5nKGUuc3RhY2suaW5kZXhPZihcIlxcblwiKSArIDEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gTk9URTogd2UgZG8gdGhlIGNoZWNrcyBmb3IgYHJlc29sdmVkUHJvbWlzZWAgaW4gZWFjaCBtZXRob2QsIGluc3RlYWQgb2ZcbiAgICAvLyBjb25zb2xpZGF0aW5nIHRoZW0gaW50byBgYmVjb21lYCwgc2luY2Ugb3RoZXJ3aXNlIHdlJ2QgY3JlYXRlIG5ld1xuICAgIC8vIHByb21pc2VzIHdpdGggdGhlIGxpbmVzIGBiZWNvbWUod2hhdGV2ZXIodmFsdWUpKWAuIFNlZSBlLmcuIEdILTI1Mi5cblxuICAgIGZ1bmN0aW9uIGJlY29tZShuZXdQcm9taXNlKSB7XG4gICAgICAgIHJlc29sdmVkUHJvbWlzZSA9IG5ld1Byb21pc2U7XG4gICAgICAgIHByb21pc2Uuc291cmNlID0gbmV3UHJvbWlzZTtcblxuICAgICAgICBhcnJheV9yZWR1Y2UobWVzc2FnZXMsIGZ1bmN0aW9uICh1bmRlZmluZWQsIG1lc3NhZ2UpIHtcbiAgICAgICAgICAgIG5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBuZXdQcm9taXNlLnByb21pc2VEaXNwYXRjaC5hcHBseShuZXdQcm9taXNlLCBtZXNzYWdlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCB2b2lkIDApO1xuXG4gICAgICAgIG1lc3NhZ2VzID0gdm9pZCAwO1xuICAgICAgICBwcm9ncmVzc0xpc3RlbmVycyA9IHZvaWQgMDtcbiAgICB9XG5cbiAgICBkZWZlcnJlZC5wcm9taXNlID0gcHJvbWlzZTtcbiAgICBkZWZlcnJlZC5yZXNvbHZlID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIGlmIChyZXNvbHZlZFByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGJlY29tZShRKHZhbHVlKSk7XG4gICAgfTtcblxuICAgIGRlZmVycmVkLmZ1bGZpbGwgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgaWYgKHJlc29sdmVkUHJvbWlzZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgYmVjb21lKGZ1bGZpbGwodmFsdWUpKTtcbiAgICB9O1xuICAgIGRlZmVycmVkLnJlamVjdCA9IGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgaWYgKHJlc29sdmVkUHJvbWlzZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgYmVjb21lKHJlamVjdChyZWFzb24pKTtcbiAgICB9O1xuICAgIGRlZmVycmVkLm5vdGlmeSA9IGZ1bmN0aW9uIChwcm9ncmVzcykge1xuICAgICAgICBpZiAocmVzb2x2ZWRQcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBhcnJheV9yZWR1Y2UocHJvZ3Jlc3NMaXN0ZW5lcnMsIGZ1bmN0aW9uICh1bmRlZmluZWQsIHByb2dyZXNzTGlzdGVuZXIpIHtcbiAgICAgICAgICAgIG5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBwcm9ncmVzc0xpc3RlbmVyKHByb2dyZXNzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCB2b2lkIDApO1xuICAgIH07XG5cbiAgICByZXR1cm4gZGVmZXJyZWQ7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIE5vZGUtc3R5bGUgY2FsbGJhY2sgdGhhdCB3aWxsIHJlc29sdmUgb3IgcmVqZWN0IHRoZSBkZWZlcnJlZFxuICogcHJvbWlzZS5cbiAqIEByZXR1cm5zIGEgbm9kZWJhY2tcbiAqL1xuZGVmZXIucHJvdG90eXBlLm1ha2VOb2RlUmVzb2x2ZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBmdW5jdGlvbiAoZXJyb3IsIHZhbHVlKSB7XG4gICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgc2VsZi5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAyKSB7XG4gICAgICAgICAgICBzZWxmLnJlc29sdmUoYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZWxmLnJlc29sdmUodmFsdWUpO1xuICAgICAgICB9XG4gICAgfTtcbn07XG5cbi8qKlxuICogQHBhcmFtIHJlc29sdmVyIHtGdW5jdGlvbn0gYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgbm90aGluZyBhbmQgYWNjZXB0c1xuICogdGhlIHJlc29sdmUsIHJlamVjdCwgYW5kIG5vdGlmeSBmdW5jdGlvbnMgZm9yIGEgZGVmZXJyZWQuXG4gKiBAcmV0dXJucyBhIHByb21pc2UgdGhhdCBtYXkgYmUgcmVzb2x2ZWQgd2l0aCB0aGUgZ2l2ZW4gcmVzb2x2ZSBhbmQgcmVqZWN0XG4gKiBmdW5jdGlvbnMsIG9yIHJlamVjdGVkIGJ5IGEgdGhyb3duIGV4Y2VwdGlvbiBpbiByZXNvbHZlclxuICovXG5RLnByb21pc2UgPSBwcm9taXNlO1xuZnVuY3Rpb24gcHJvbWlzZShyZXNvbHZlcikge1xuICAgIGlmICh0eXBlb2YgcmVzb2x2ZXIgIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwicmVzb2x2ZXIgbXVzdCBiZSBhIGZ1bmN0aW9uLlwiKTtcbiAgICB9XG4gICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICB0cnkge1xuICAgICAgICByZXNvbHZlcihkZWZlcnJlZC5yZXNvbHZlLCBkZWZlcnJlZC5yZWplY3QsIGRlZmVycmVkLm5vdGlmeSk7XG4gICAgfSBjYXRjaCAocmVhc29uKSB7XG4gICAgICAgIGRlZmVycmVkLnJlamVjdChyZWFzb24pO1xuICAgIH1cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn1cblxuLy8gWFhYIGV4cGVyaW1lbnRhbC4gIFRoaXMgbWV0aG9kIGlzIGEgd2F5IHRvIGRlbm90ZSB0aGF0IGEgbG9jYWwgdmFsdWUgaXNcbi8vIHNlcmlhbGl6YWJsZSBhbmQgc2hvdWxkIGJlIGltbWVkaWF0ZWx5IGRpc3BhdGNoZWQgdG8gYSByZW1vdGUgdXBvbiByZXF1ZXN0LFxuLy8gaW5zdGVhZCBvZiBwYXNzaW5nIGEgcmVmZXJlbmNlLlxuUS5wYXNzQnlDb3B5ID0gZnVuY3Rpb24gKG9iamVjdCkge1xuICAgIC8vZnJlZXplKG9iamVjdCk7XG4gICAgLy9wYXNzQnlDb3BpZXMuc2V0KG9iamVjdCwgdHJ1ZSk7XG4gICAgcmV0dXJuIG9iamVjdDtcbn07XG5cblByb21pc2UucHJvdG90eXBlLnBhc3NCeUNvcHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgLy9mcmVlemUob2JqZWN0KTtcbiAgICAvL3Bhc3NCeUNvcGllcy5zZXQob2JqZWN0LCB0cnVlKTtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogSWYgdHdvIHByb21pc2VzIGV2ZW50dWFsbHkgZnVsZmlsbCB0byB0aGUgc2FtZSB2YWx1ZSwgcHJvbWlzZXMgdGhhdCB2YWx1ZSxcbiAqIGJ1dCBvdGhlcndpc2UgcmVqZWN0cy5cbiAqIEBwYXJhbSB4IHtBbnkqfVxuICogQHBhcmFtIHkge0FueSp9XG4gKiBAcmV0dXJucyB7QW55Kn0gYSBwcm9taXNlIGZvciB4IGFuZCB5IGlmIHRoZXkgYXJlIHRoZSBzYW1lLCBidXQgYSByZWplY3Rpb25cbiAqIG90aGVyd2lzZS5cbiAqXG4gKi9cblEuam9pbiA9IGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgcmV0dXJuIFEoeCkuam9pbih5KTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLmpvaW4gPSBmdW5jdGlvbiAodGhhdCkge1xuICAgIHJldHVybiBRKFt0aGlzLCB0aGF0XSkuc3ByZWFkKGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgIGlmICh4ID09PSB5KSB7XG4gICAgICAgICAgICAvLyBUT0RPOiBcIj09PVwiIHNob3VsZCBiZSBPYmplY3QuaXMgb3IgZXF1aXZcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3Qgam9pbjogbm90IHRoZSBzYW1lOiBcIiArIHggKyBcIiBcIiArIHkpO1xuICAgICAgICB9XG4gICAgfSk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgZmlyc3Qgb2YgYW4gYXJyYXkgb2YgcHJvbWlzZXMgdG8gYmVjb21lIGZ1bGZpbGxlZC5cbiAqIEBwYXJhbSBhbnN3ZXJzIHtBcnJheVtBbnkqXX0gcHJvbWlzZXMgdG8gcmFjZVxuICogQHJldHVybnMge0FueSp9IHRoZSBmaXJzdCBwcm9taXNlIHRvIGJlIGZ1bGZpbGxlZFxuICovXG5RLnJhY2UgPSByYWNlO1xuZnVuY3Rpb24gcmFjZShhbnN3ZXJQcykge1xuICAgIHJldHVybiBwcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAvLyBTd2l0Y2ggdG8gdGhpcyBvbmNlIHdlIGNhbiBhc3N1bWUgYXQgbGVhc3QgRVM1XG4gICAgICAgIC8vIGFuc3dlclBzLmZvckVhY2goZnVuY3Rpb24oYW5zd2VyUCkge1xuICAgICAgICAvLyAgICAgUShhbnN3ZXJQKS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG4gICAgICAgIC8vIH0pO1xuICAgICAgICAvLyBVc2UgdGhpcyBpbiB0aGUgbWVhbnRpbWVcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGFuc3dlclBzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBRKGFuc3dlclBzW2ldKS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUucmFjZSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKFEucmFjZSk7XG59O1xuXG4vKipcbiAqIENvbnN0cnVjdHMgYSBQcm9taXNlIHdpdGggYSBwcm9taXNlIGRlc2NyaXB0b3Igb2JqZWN0IGFuZCBvcHRpb25hbCBmYWxsYmFja1xuICogZnVuY3Rpb24uICBUaGUgZGVzY3JpcHRvciBjb250YWlucyBtZXRob2RzIGxpa2Ugd2hlbihyZWplY3RlZCksIGdldChuYW1lKSxcbiAqIHNldChuYW1lLCB2YWx1ZSksIHBvc3QobmFtZSwgYXJncyksIGFuZCBkZWxldGUobmFtZSksIHdoaWNoIGFsbFxuICogcmV0dXJuIGVpdGhlciBhIHZhbHVlLCBhIHByb21pc2UgZm9yIGEgdmFsdWUsIG9yIGEgcmVqZWN0aW9uLiAgVGhlIGZhbGxiYWNrXG4gKiBhY2NlcHRzIHRoZSBvcGVyYXRpb24gbmFtZSwgYSByZXNvbHZlciwgYW5kIGFueSBmdXJ0aGVyIGFyZ3VtZW50cyB0aGF0IHdvdWxkXG4gKiBoYXZlIGJlZW4gZm9yd2FyZGVkIHRvIHRoZSBhcHByb3ByaWF0ZSBtZXRob2QgYWJvdmUgaGFkIGEgbWV0aG9kIGJlZW5cbiAqIHByb3ZpZGVkIHdpdGggdGhlIHByb3BlciBuYW1lLiAgVGhlIEFQSSBtYWtlcyBubyBndWFyYW50ZWVzIGFib3V0IHRoZSBuYXR1cmVcbiAqIG9mIHRoZSByZXR1cm5lZCBvYmplY3QsIGFwYXJ0IGZyb20gdGhhdCBpdCBpcyB1c2FibGUgd2hlcmVldmVyIHByb21pc2VzIGFyZVxuICogYm91Z2h0IGFuZCBzb2xkLlxuICovXG5RLm1ha2VQcm9taXNlID0gUHJvbWlzZTtcbmZ1bmN0aW9uIFByb21pc2UoZGVzY3JpcHRvciwgZmFsbGJhY2ssIGluc3BlY3QpIHtcbiAgICBpZiAoZmFsbGJhY2sgPT09IHZvaWQgMCkge1xuICAgICAgICBmYWxsYmFjayA9IGZ1bmN0aW9uIChvcCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlamVjdChuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgXCJQcm9taXNlIGRvZXMgbm90IHN1cHBvcnQgb3BlcmF0aW9uOiBcIiArIG9wXG4gICAgICAgICAgICApKTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgaWYgKGluc3BlY3QgPT09IHZvaWQgMCkge1xuICAgICAgICBpbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHtzdGF0ZTogXCJ1bmtub3duXCJ9O1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHZhciBwcm9taXNlID0gb2JqZWN0X2NyZWF0ZShQcm9taXNlLnByb3RvdHlwZSk7XG5cbiAgICBwcm9taXNlLnByb21pc2VEaXNwYXRjaCA9IGZ1bmN0aW9uIChyZXNvbHZlLCBvcCwgYXJncykge1xuICAgICAgICB2YXIgcmVzdWx0O1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKGRlc2NyaXB0b3Jbb3BdKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gZGVzY3JpcHRvcltvcF0uYXBwbHkocHJvbWlzZSwgYXJncyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IGZhbGxiYWNrLmNhbGwocHJvbWlzZSwgb3AsIGFyZ3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IHJlamVjdChleGNlcHRpb24pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXNvbHZlKSB7XG4gICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgcHJvbWlzZS5pbnNwZWN0ID0gaW5zcGVjdDtcblxuICAgIC8vIFhYWCBkZXByZWNhdGVkIGB2YWx1ZU9mYCBhbmQgYGV4Y2VwdGlvbmAgc3VwcG9ydFxuICAgIGlmIChpbnNwZWN0KSB7XG4gICAgICAgIHZhciBpbnNwZWN0ZWQgPSBpbnNwZWN0KCk7XG4gICAgICAgIGlmIChpbnNwZWN0ZWQuc3RhdGUgPT09IFwicmVqZWN0ZWRcIikge1xuICAgICAgICAgICAgcHJvbWlzZS5leGNlcHRpb24gPSBpbnNwZWN0ZWQucmVhc29uO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJvbWlzZS52YWx1ZU9mID0gZGVwcmVjYXRlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBpbnNwZWN0ZWQgPSBpbnNwZWN0KCk7XG4gICAgICAgICAgICBpZiAoaW5zcGVjdGVkLnN0YXRlID09PSBcInBlbmRpbmdcIiB8fFxuICAgICAgICAgICAgICAgIGluc3BlY3RlZC5zdGF0ZSA9PT0gXCJyZWplY3RlZFwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gaW5zcGVjdGVkLnZhbHVlO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcHJvbWlzZTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIFwiW29iamVjdCBQcm9taXNlXVwiO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUudGhlbiA9IGZ1bmN0aW9uIChmdWxmaWxsZWQsIHJlamVjdGVkLCBwcm9ncmVzc2VkKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgdmFyIGRvbmUgPSBmYWxzZTsgICAvLyBlbnN1cmUgdGhlIHVudHJ1c3RlZCBwcm9taXNlIG1ha2VzIGF0IG1vc3QgYVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc2luZ2xlIGNhbGwgdG8gb25lIG9mIHRoZSBjYWxsYmFja3NcblxuICAgIGZ1bmN0aW9uIF9mdWxmaWxsZWQodmFsdWUpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgZnVsZmlsbGVkID09PSBcImZ1bmN0aW9uXCIgPyBmdWxmaWxsZWQodmFsdWUpIDogdmFsdWU7XG4gICAgICAgIH0gY2F0Y2ggKGV4Y2VwdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIHJlamVjdChleGNlcHRpb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX3JlamVjdGVkKGV4Y2VwdGlvbikge1xuICAgICAgICBpZiAodHlwZW9mIHJlamVjdGVkID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIG1ha2VTdGFja1RyYWNlTG9uZyhleGNlcHRpb24sIHNlbGYpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0ZWQoZXhjZXB0aW9uKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKG5ld0V4Y2VwdGlvbikge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QobmV3RXhjZXB0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVqZWN0KGV4Y2VwdGlvbik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX3Byb2dyZXNzZWQodmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiBwcm9ncmVzc2VkID09PSBcImZ1bmN0aW9uXCIgPyBwcm9ncmVzc2VkKHZhbHVlKSA6IHZhbHVlO1xuICAgIH1cblxuICAgIG5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc2VsZi5wcm9taXNlRGlzcGF0Y2goZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAoZG9uZSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xuXG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKF9mdWxmaWxsZWQodmFsdWUpKTtcbiAgICAgICAgfSwgXCJ3aGVuXCIsIFtmdW5jdGlvbiAoZXhjZXB0aW9uKSB7XG4gICAgICAgICAgICBpZiAoZG9uZSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xuXG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKF9yZWplY3RlZChleGNlcHRpb24pKTtcbiAgICAgICAgfV0pO1xuICAgIH0pO1xuXG4gICAgLy8gUHJvZ3Jlc3MgcHJvcGFnYXRvciBuZWVkIHRvIGJlIGF0dGFjaGVkIGluIHRoZSBjdXJyZW50IHRpY2suXG4gICAgc2VsZi5wcm9taXNlRGlzcGF0Y2godm9pZCAwLCBcIndoZW5cIiwgW3ZvaWQgMCwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHZhciBuZXdWYWx1ZTtcbiAgICAgICAgdmFyIHRocmV3ID0gZmFsc2U7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBuZXdWYWx1ZSA9IF9wcm9ncmVzc2VkKHZhbHVlKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhyZXcgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKFEub25lcnJvcikge1xuICAgICAgICAgICAgICAgIFEub25lcnJvcihlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhyZXcpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShuZXdWYWx1ZSk7XG4gICAgICAgIH1cbiAgICB9XSk7XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIG9ic2VydmVyIG9uIGEgcHJvbWlzZS5cbiAqXG4gKiBHdWFyYW50ZWVzOlxuICpcbiAqIDEuIHRoYXQgZnVsZmlsbGVkIGFuZCByZWplY3RlZCB3aWxsIGJlIGNhbGxlZCBvbmx5IG9uY2UuXG4gKiAyLiB0aGF0IGVpdGhlciB0aGUgZnVsZmlsbGVkIGNhbGxiYWNrIG9yIHRoZSByZWplY3RlZCBjYWxsYmFjayB3aWxsIGJlXG4gKiAgICBjYWxsZWQsIGJ1dCBub3QgYm90aC5cbiAqIDMuIHRoYXQgZnVsZmlsbGVkIGFuZCByZWplY3RlZCB3aWxsIG5vdCBiZSBjYWxsZWQgaW4gdGhpcyB0dXJuLlxuICpcbiAqIEBwYXJhbSB2YWx1ZSAgICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSB0byBvYnNlcnZlXG4gKiBAcGFyYW0gZnVsZmlsbGVkICBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2l0aCB0aGUgZnVsZmlsbGVkIHZhbHVlXG4gKiBAcGFyYW0gcmVqZWN0ZWQgICBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2l0aCB0aGUgcmVqZWN0aW9uIGV4Y2VwdGlvblxuICogQHBhcmFtIHByb2dyZXNzZWQgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIG9uIGFueSBwcm9ncmVzcyBub3RpZmljYXRpb25zXG4gKiBAcmV0dXJuIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWUgZnJvbSB0aGUgaW52b2tlZCBjYWxsYmFja1xuICovXG5RLndoZW4gPSB3aGVuO1xuZnVuY3Rpb24gd2hlbih2YWx1ZSwgZnVsZmlsbGVkLCByZWplY3RlZCwgcHJvZ3Jlc3NlZCkge1xuICAgIHJldHVybiBRKHZhbHVlKS50aGVuKGZ1bGZpbGxlZCwgcmVqZWN0ZWQsIHByb2dyZXNzZWQpO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS50aGVuUmVzb2x2ZSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiB0aGlzLnRoZW4oZnVuY3Rpb24gKCkgeyByZXR1cm4gdmFsdWU7IH0pO1xufTtcblxuUS50aGVuUmVzb2x2ZSA9IGZ1bmN0aW9uIChwcm9taXNlLCB2YWx1ZSkge1xuICAgIHJldHVybiBRKHByb21pc2UpLnRoZW5SZXNvbHZlKHZhbHVlKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLnRoZW5SZWplY3QgPSBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgcmV0dXJuIHRoaXMudGhlbihmdW5jdGlvbiAoKSB7IHRocm93IHJlYXNvbjsgfSk7XG59O1xuXG5RLnRoZW5SZWplY3QgPSBmdW5jdGlvbiAocHJvbWlzZSwgcmVhc29uKSB7XG4gICAgcmV0dXJuIFEocHJvbWlzZSkudGhlblJlamVjdChyZWFzb24pO1xufTtcblxuLyoqXG4gKiBJZiBhbiBvYmplY3QgaXMgbm90IGEgcHJvbWlzZSwgaXQgaXMgYXMgXCJuZWFyXCIgYXMgcG9zc2libGUuXG4gKiBJZiBhIHByb21pc2UgaXMgcmVqZWN0ZWQsIGl0IGlzIGFzIFwibmVhclwiIGFzIHBvc3NpYmxlIHRvby5cbiAqIElmIGl04oCZcyBhIGZ1bGZpbGxlZCBwcm9taXNlLCB0aGUgZnVsZmlsbG1lbnQgdmFsdWUgaXMgbmVhcmVyLlxuICogSWYgaXTigJlzIGEgZGVmZXJyZWQgcHJvbWlzZSBhbmQgdGhlIGRlZmVycmVkIGhhcyBiZWVuIHJlc29sdmVkLCB0aGVcbiAqIHJlc29sdXRpb24gaXMgXCJuZWFyZXJcIi5cbiAqIEBwYXJhbSBvYmplY3RcbiAqIEByZXR1cm5zIG1vc3QgcmVzb2x2ZWQgKG5lYXJlc3QpIGZvcm0gb2YgdGhlIG9iamVjdFxuICovXG5cbi8vIFhYWCBzaG91bGQgd2UgcmUtZG8gdGhpcz9cblEubmVhcmVyID0gbmVhcmVyO1xuZnVuY3Rpb24gbmVhcmVyKHZhbHVlKSB7XG4gICAgaWYgKGlzUHJvbWlzZSh2YWx1ZSkpIHtcbiAgICAgICAgdmFyIGluc3BlY3RlZCA9IHZhbHVlLmluc3BlY3QoKTtcbiAgICAgICAgaWYgKGluc3BlY3RlZC5zdGF0ZSA9PT0gXCJmdWxmaWxsZWRcIikge1xuICAgICAgICAgICAgcmV0dXJuIGluc3BlY3RlZC52YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG59XG5cbi8qKlxuICogQHJldHVybnMgd2hldGhlciB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGEgcHJvbWlzZS5cbiAqIE90aGVyd2lzZSBpdCBpcyBhIGZ1bGZpbGxlZCB2YWx1ZS5cbiAqL1xuUS5pc1Byb21pc2UgPSBpc1Byb21pc2U7XG5mdW5jdGlvbiBpc1Byb21pc2Uob2JqZWN0KSB7XG4gICAgcmV0dXJuIGlzT2JqZWN0KG9iamVjdCkgJiZcbiAgICAgICAgdHlwZW9mIG9iamVjdC5wcm9taXNlRGlzcGF0Y2ggPT09IFwiZnVuY3Rpb25cIiAmJlxuICAgICAgICB0eXBlb2Ygb2JqZWN0Lmluc3BlY3QgPT09IFwiZnVuY3Rpb25cIjtcbn1cblxuUS5pc1Byb21pc2VBbGlrZSA9IGlzUHJvbWlzZUFsaWtlO1xuZnVuY3Rpb24gaXNQcm9taXNlQWxpa2Uob2JqZWN0KSB7XG4gICAgcmV0dXJuIGlzT2JqZWN0KG9iamVjdCkgJiYgdHlwZW9mIG9iamVjdC50aGVuID09PSBcImZ1bmN0aW9uXCI7XG59XG5cbi8qKlxuICogQHJldHVybnMgd2hldGhlciB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGEgcGVuZGluZyBwcm9taXNlLCBtZWFuaW5nIG5vdFxuICogZnVsZmlsbGVkIG9yIHJlamVjdGVkLlxuICovXG5RLmlzUGVuZGluZyA9IGlzUGVuZGluZztcbmZ1bmN0aW9uIGlzUGVuZGluZyhvYmplY3QpIHtcbiAgICByZXR1cm4gaXNQcm9taXNlKG9iamVjdCkgJiYgb2JqZWN0Lmluc3BlY3QoKS5zdGF0ZSA9PT0gXCJwZW5kaW5nXCI7XG59XG5cblByb21pc2UucHJvdG90eXBlLmlzUGVuZGluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5pbnNwZWN0KCkuc3RhdGUgPT09IFwicGVuZGluZ1wiO1xufTtcblxuLyoqXG4gKiBAcmV0dXJucyB3aGV0aGVyIHRoZSBnaXZlbiBvYmplY3QgaXMgYSB2YWx1ZSBvciBmdWxmaWxsZWRcbiAqIHByb21pc2UuXG4gKi9cblEuaXNGdWxmaWxsZWQgPSBpc0Z1bGZpbGxlZDtcbmZ1bmN0aW9uIGlzRnVsZmlsbGVkKG9iamVjdCkge1xuICAgIHJldHVybiAhaXNQcm9taXNlKG9iamVjdCkgfHwgb2JqZWN0Lmluc3BlY3QoKS5zdGF0ZSA9PT0gXCJmdWxmaWxsZWRcIjtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUuaXNGdWxmaWxsZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuaW5zcGVjdCgpLnN0YXRlID09PSBcImZ1bGZpbGxlZFwiO1xufTtcblxuLyoqXG4gKiBAcmV0dXJucyB3aGV0aGVyIHRoZSBnaXZlbiBvYmplY3QgaXMgYSByZWplY3RlZCBwcm9taXNlLlxuICovXG5RLmlzUmVqZWN0ZWQgPSBpc1JlamVjdGVkO1xuZnVuY3Rpb24gaXNSZWplY3RlZChvYmplY3QpIHtcbiAgICByZXR1cm4gaXNQcm9taXNlKG9iamVjdCkgJiYgb2JqZWN0Lmluc3BlY3QoKS5zdGF0ZSA9PT0gXCJyZWplY3RlZFwiO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS5pc1JlamVjdGVkID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmluc3BlY3QoKS5zdGF0ZSA9PT0gXCJyZWplY3RlZFwiO1xufTtcblxuLy8vLyBCRUdJTiBVTkhBTkRMRUQgUkVKRUNUSU9OIFRSQUNLSU5HXG5cbi8vIFRoaXMgcHJvbWlzZSBsaWJyYXJ5IGNvbnN1bWVzIGV4Y2VwdGlvbnMgdGhyb3duIGluIGhhbmRsZXJzIHNvIHRoZXkgY2FuIGJlXG4vLyBoYW5kbGVkIGJ5IGEgc3Vic2VxdWVudCBwcm9taXNlLiAgVGhlIGV4Y2VwdGlvbnMgZ2V0IGFkZGVkIHRvIHRoaXMgYXJyYXkgd2hlblxuLy8gdGhleSBhcmUgY3JlYXRlZCwgYW5kIHJlbW92ZWQgd2hlbiB0aGV5IGFyZSBoYW5kbGVkLiAgTm90ZSB0aGF0IGluIEVTNiBvclxuLy8gc2hpbW1lZCBlbnZpcm9ubWVudHMsIHRoaXMgd291bGQgbmF0dXJhbGx5IGJlIGEgYFNldGAuXG52YXIgdW5oYW5kbGVkUmVhc29ucyA9IFtdO1xudmFyIHVuaGFuZGxlZFJlamVjdGlvbnMgPSBbXTtcbnZhciB1bmhhbmRsZWRSZWFzb25zRGlzcGxheWVkID0gZmFsc2U7XG52YXIgdHJhY2tVbmhhbmRsZWRSZWplY3Rpb25zID0gdHJ1ZTtcbmZ1bmN0aW9uIGRpc3BsYXlVbmhhbmRsZWRSZWFzb25zKCkge1xuICAgIGlmIChcbiAgICAgICAgIXVuaGFuZGxlZFJlYXNvbnNEaXNwbGF5ZWQgJiZcbiAgICAgICAgdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiAmJlxuICAgICAgICAhd2luZG93LlRvdWNoICYmXG4gICAgICAgIHdpbmRvdy5jb25zb2xlXG4gICAgKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcIltRXSBVbmhhbmRsZWQgcmVqZWN0aW9uIHJlYXNvbnMgKHNob3VsZCBiZSBlbXB0eSk6XCIsXG4gICAgICAgICAgICAgICAgICAgICB1bmhhbmRsZWRSZWFzb25zKTtcbiAgICB9XG5cbiAgICB1bmhhbmRsZWRSZWFzb25zRGlzcGxheWVkID0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gbG9nVW5oYW5kbGVkUmVhc29ucygpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHVuaGFuZGxlZFJlYXNvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHJlYXNvbiA9IHVuaGFuZGxlZFJlYXNvbnNbaV07XG4gICAgICAgIGNvbnNvbGUud2FybihcIlVuaGFuZGxlZCByZWplY3Rpb24gcmVhc29uOlwiLCByZWFzb24pO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVzZXRVbmhhbmRsZWRSZWplY3Rpb25zKCkge1xuICAgIHVuaGFuZGxlZFJlYXNvbnMubGVuZ3RoID0gMDtcbiAgICB1bmhhbmRsZWRSZWplY3Rpb25zLmxlbmd0aCA9IDA7XG4gICAgdW5oYW5kbGVkUmVhc29uc0Rpc3BsYXllZCA9IGZhbHNlO1xuXG4gICAgaWYgKCF0cmFja1VuaGFuZGxlZFJlamVjdGlvbnMpIHtcbiAgICAgICAgdHJhY2tVbmhhbmRsZWRSZWplY3Rpb25zID0gdHJ1ZTtcblxuICAgICAgICAvLyBTaG93IHVuaGFuZGxlZCByZWplY3Rpb24gcmVhc29ucyBpZiBOb2RlIGV4aXRzIHdpdGhvdXQgaGFuZGxpbmcgYW5cbiAgICAgICAgLy8gb3V0c3RhbmRpbmcgcmVqZWN0aW9uLiAgKE5vdGUgdGhhdCBCcm93c2VyaWZ5IHByZXNlbnRseSBwcm9kdWNlcyBhXG4gICAgICAgIC8vIGBwcm9jZXNzYCBnbG9iYWwgd2l0aG91dCB0aGUgYEV2ZW50RW1pdHRlcmAgYG9uYCBtZXRob2QuKVxuICAgICAgICBpZiAodHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgcHJvY2Vzcy5vbikge1xuICAgICAgICAgICAgcHJvY2Vzcy5vbihcImV4aXRcIiwgbG9nVW5oYW5kbGVkUmVhc29ucyk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRyYWNrUmVqZWN0aW9uKHByb21pc2UsIHJlYXNvbikge1xuICAgIGlmICghdHJhY2tVbmhhbmRsZWRSZWplY3Rpb25zKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB1bmhhbmRsZWRSZWplY3Rpb25zLnB1c2gocHJvbWlzZSk7XG4gICAgaWYgKHJlYXNvbiAmJiB0eXBlb2YgcmVhc29uLnN0YWNrICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIHVuaGFuZGxlZFJlYXNvbnMucHVzaChyZWFzb24uc3RhY2spO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHVuaGFuZGxlZFJlYXNvbnMucHVzaChcIihubyBzdGFjaykgXCIgKyByZWFzb24pO1xuICAgIH1cbiAgICBkaXNwbGF5VW5oYW5kbGVkUmVhc29ucygpO1xufVxuXG5mdW5jdGlvbiB1bnRyYWNrUmVqZWN0aW9uKHByb21pc2UpIHtcbiAgICBpZiAoIXRyYWNrVW5oYW5kbGVkUmVqZWN0aW9ucykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGF0ID0gYXJyYXlfaW5kZXhPZih1bmhhbmRsZWRSZWplY3Rpb25zLCBwcm9taXNlKTtcbiAgICBpZiAoYXQgIT09IC0xKSB7XG4gICAgICAgIHVuaGFuZGxlZFJlamVjdGlvbnMuc3BsaWNlKGF0LCAxKTtcbiAgICAgICAgdW5oYW5kbGVkUmVhc29ucy5zcGxpY2UoYXQsIDEpO1xuICAgIH1cbn1cblxuUS5yZXNldFVuaGFuZGxlZFJlamVjdGlvbnMgPSByZXNldFVuaGFuZGxlZFJlamVjdGlvbnM7XG5cblEuZ2V0VW5oYW5kbGVkUmVhc29ucyA9IGZ1bmN0aW9uICgpIHtcbiAgICAvLyBNYWtlIGEgY29weSBzbyB0aGF0IGNvbnN1bWVycyBjYW4ndCBpbnRlcmZlcmUgd2l0aCBvdXIgaW50ZXJuYWwgc3RhdGUuXG4gICAgcmV0dXJuIHVuaGFuZGxlZFJlYXNvbnMuc2xpY2UoKTtcbn07XG5cblEuc3RvcFVuaGFuZGxlZFJlamVjdGlvblRyYWNraW5nID0gZnVuY3Rpb24gKCkge1xuICAgIHJlc2V0VW5oYW5kbGVkUmVqZWN0aW9ucygpO1xuICAgIGlmICh0eXBlb2YgcHJvY2VzcyAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwcm9jZXNzLm9uKSB7XG4gICAgICAgIHByb2Nlc3MucmVtb3ZlTGlzdGVuZXIoXCJleGl0XCIsIGxvZ1VuaGFuZGxlZFJlYXNvbnMpO1xuICAgIH1cbiAgICB0cmFja1VuaGFuZGxlZFJlamVjdGlvbnMgPSBmYWxzZTtcbn07XG5cbnJlc2V0VW5oYW5kbGVkUmVqZWN0aW9ucygpO1xuXG4vLy8vIEVORCBVTkhBTkRMRUQgUkVKRUNUSU9OIFRSQUNLSU5HXG5cbi8qKlxuICogQ29uc3RydWN0cyBhIHJlamVjdGVkIHByb21pc2UuXG4gKiBAcGFyYW0gcmVhc29uIHZhbHVlIGRlc2NyaWJpbmcgdGhlIGZhaWx1cmVcbiAqL1xuUS5yZWplY3QgPSByZWplY3Q7XG5mdW5jdGlvbiByZWplY3QocmVhc29uKSB7XG4gICAgdmFyIHJlamVjdGlvbiA9IFByb21pc2Uoe1xuICAgICAgICBcIndoZW5cIjogZnVuY3Rpb24gKHJlamVjdGVkKSB7XG4gICAgICAgICAgICAvLyBub3RlIHRoYXQgdGhlIGVycm9yIGhhcyBiZWVuIGhhbmRsZWRcbiAgICAgICAgICAgIGlmIChyZWplY3RlZCkge1xuICAgICAgICAgICAgICAgIHVudHJhY2tSZWplY3Rpb24odGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVqZWN0ZWQgPyByZWplY3RlZChyZWFzb24pIDogdGhpcztcbiAgICAgICAgfVxuICAgIH0sIGZ1bmN0aW9uIGZhbGxiYWNrKCkge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LCBmdW5jdGlvbiBpbnNwZWN0KCkge1xuICAgICAgICByZXR1cm4geyBzdGF0ZTogXCJyZWplY3RlZFwiLCByZWFzb246IHJlYXNvbiB9O1xuICAgIH0pO1xuXG4gICAgLy8gTm90ZSB0aGF0IHRoZSByZWFzb24gaGFzIG5vdCBiZWVuIGhhbmRsZWQuXG4gICAgdHJhY2tSZWplY3Rpb24ocmVqZWN0aW9uLCByZWFzb24pO1xuXG4gICAgcmV0dXJuIHJlamVjdGlvbjtcbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3RzIGEgZnVsZmlsbGVkIHByb21pc2UgZm9yIGFuIGltbWVkaWF0ZSByZWZlcmVuY2UuXG4gKiBAcGFyYW0gdmFsdWUgaW1tZWRpYXRlIHJlZmVyZW5jZVxuICovXG5RLmZ1bGZpbGwgPSBmdWxmaWxsO1xuZnVuY3Rpb24gZnVsZmlsbCh2YWx1ZSkge1xuICAgIHJldHVybiBQcm9taXNlKHtcbiAgICAgICAgXCJ3aGVuXCI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgXCJnZXRcIjogZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZVtuYW1lXTtcbiAgICAgICAgfSxcbiAgICAgICAgXCJzZXRcIjogZnVuY3Rpb24gKG5hbWUsIHJocykge1xuICAgICAgICAgICAgdmFsdWVbbmFtZV0gPSByaHM7XG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVsZXRlXCI6IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgICAgICBkZWxldGUgdmFsdWVbbmFtZV07XG4gICAgICAgIH0sXG4gICAgICAgIFwicG9zdFwiOiBmdW5jdGlvbiAobmFtZSwgYXJncykge1xuICAgICAgICAgICAgLy8gTWFyayBNaWxsZXIgcHJvcG9zZXMgdGhhdCBwb3N0IHdpdGggbm8gbmFtZSBzaG91bGQgYXBwbHkgYVxuICAgICAgICAgICAgLy8gcHJvbWlzZWQgZnVuY3Rpb24uXG4gICAgICAgICAgICBpZiAobmFtZSA9PT0gbnVsbCB8fCBuYW1lID09PSB2b2lkIDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUuYXBwbHkodm9pZCAwLCBhcmdzKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlW25hbWVdLmFwcGx5KHZhbHVlLCBhcmdzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJhcHBseVwiOiBmdW5jdGlvbiAodGhpc3AsIGFyZ3MpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS5hcHBseSh0aGlzcCwgYXJncyk7XG4gICAgICAgIH0sXG4gICAgICAgIFwia2V5c1wiOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gb2JqZWN0X2tleXModmFsdWUpO1xuICAgICAgICB9XG4gICAgfSwgdm9pZCAwLCBmdW5jdGlvbiBpbnNwZWN0KCkge1xuICAgICAgICByZXR1cm4geyBzdGF0ZTogXCJmdWxmaWxsZWRcIiwgdmFsdWU6IHZhbHVlIH07XG4gICAgfSk7XG59XG5cbi8qKlxuICogQ29udmVydHMgdGhlbmFibGVzIHRvIFEgcHJvbWlzZXMuXG4gKiBAcGFyYW0gcHJvbWlzZSB0aGVuYWJsZSBwcm9taXNlXG4gKiBAcmV0dXJucyBhIFEgcHJvbWlzZVxuICovXG5mdW5jdGlvbiBjb2VyY2UocHJvbWlzZSkge1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgbmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcHJvbWlzZS50aGVuKGRlZmVycmVkLnJlc29sdmUsIGRlZmVycmVkLnJlamVjdCwgZGVmZXJyZWQubm90aWZ5KTtcbiAgICAgICAgfSBjYXRjaCAoZXhjZXB0aW9uKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXhjZXB0aW9uKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufVxuXG4vKipcbiAqIEFubm90YXRlcyBhbiBvYmplY3Qgc3VjaCB0aGF0IGl0IHdpbGwgbmV2ZXIgYmVcbiAqIHRyYW5zZmVycmVkIGF3YXkgZnJvbSB0aGlzIHByb2Nlc3Mgb3ZlciBhbnkgcHJvbWlzZVxuICogY29tbXVuaWNhdGlvbiBjaGFubmVsLlxuICogQHBhcmFtIG9iamVjdFxuICogQHJldHVybnMgcHJvbWlzZSBhIHdyYXBwaW5nIG9mIHRoYXQgb2JqZWN0IHRoYXRcbiAqIGFkZGl0aW9uYWxseSByZXNwb25kcyB0byB0aGUgXCJpc0RlZlwiIG1lc3NhZ2VcbiAqIHdpdGhvdXQgYSByZWplY3Rpb24uXG4gKi9cblEubWFzdGVyID0gbWFzdGVyO1xuZnVuY3Rpb24gbWFzdGVyKG9iamVjdCkge1xuICAgIHJldHVybiBQcm9taXNlKHtcbiAgICAgICAgXCJpc0RlZlwiOiBmdW5jdGlvbiAoKSB7fVxuICAgIH0sIGZ1bmN0aW9uIGZhbGxiYWNrKG9wLCBhcmdzKSB7XG4gICAgICAgIHJldHVybiBkaXNwYXRjaChvYmplY3QsIG9wLCBhcmdzKTtcbiAgICB9LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBRKG9iamVjdCkuaW5zcGVjdCgpO1xuICAgIH0pO1xufVxuXG4vKipcbiAqIFNwcmVhZHMgdGhlIHZhbHVlcyBvZiBhIHByb21pc2VkIGFycmF5IG9mIGFyZ3VtZW50cyBpbnRvIHRoZVxuICogZnVsZmlsbG1lbnQgY2FsbGJhY2suXG4gKiBAcGFyYW0gZnVsZmlsbGVkIGNhbGxiYWNrIHRoYXQgcmVjZWl2ZXMgdmFyaWFkaWMgYXJndW1lbnRzIGZyb20gdGhlXG4gKiBwcm9taXNlZCBhcnJheVxuICogQHBhcmFtIHJlamVjdGVkIGNhbGxiYWNrIHRoYXQgcmVjZWl2ZXMgdGhlIGV4Y2VwdGlvbiBpZiB0aGUgcHJvbWlzZVxuICogaXMgcmVqZWN0ZWQuXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWUgb3IgdGhyb3duIGV4Y2VwdGlvbiBvZlxuICogZWl0aGVyIGNhbGxiYWNrLlxuICovXG5RLnNwcmVhZCA9IHNwcmVhZDtcbmZ1bmN0aW9uIHNwcmVhZCh2YWx1ZSwgZnVsZmlsbGVkLCByZWplY3RlZCkge1xuICAgIHJldHVybiBRKHZhbHVlKS5zcHJlYWQoZnVsZmlsbGVkLCByZWplY3RlZCk7XG59XG5cblByb21pc2UucHJvdG90eXBlLnNwcmVhZCA9IGZ1bmN0aW9uIChmdWxmaWxsZWQsIHJlamVjdGVkKSB7XG4gICAgcmV0dXJuIHRoaXMuYWxsKCkudGhlbihmdW5jdGlvbiAoYXJyYXkpIHtcbiAgICAgICAgcmV0dXJuIGZ1bGZpbGxlZC5hcHBseSh2b2lkIDAsIGFycmF5KTtcbiAgICB9LCByZWplY3RlZCk7XG59O1xuXG4vKipcbiAqIFRoZSBhc3luYyBmdW5jdGlvbiBpcyBhIGRlY29yYXRvciBmb3IgZ2VuZXJhdG9yIGZ1bmN0aW9ucywgdHVybmluZ1xuICogdGhlbSBpbnRvIGFzeW5jaHJvbm91cyBnZW5lcmF0b3JzLiAgQWx0aG91Z2ggZ2VuZXJhdG9ycyBhcmUgb25seSBwYXJ0XG4gKiBvZiB0aGUgbmV3ZXN0IEVDTUFTY3JpcHQgNiBkcmFmdHMsIHRoaXMgY29kZSBkb2VzIG5vdCBjYXVzZSBzeW50YXhcbiAqIGVycm9ycyBpbiBvbGRlciBlbmdpbmVzLiAgVGhpcyBjb2RlIHNob3VsZCBjb250aW51ZSB0byB3b3JrIGFuZCB3aWxsXG4gKiBpbiBmYWN0IGltcHJvdmUgb3ZlciB0aW1lIGFzIHRoZSBsYW5ndWFnZSBpbXByb3Zlcy5cbiAqXG4gKiBFUzYgZ2VuZXJhdG9ycyBhcmUgY3VycmVudGx5IHBhcnQgb2YgVjggdmVyc2lvbiAzLjE5IHdpdGggdGhlXG4gKiAtLWhhcm1vbnktZ2VuZXJhdG9ycyBydW50aW1lIGZsYWcgZW5hYmxlZC4gIFNwaWRlck1vbmtleSBoYXMgaGFkIHRoZW1cbiAqIGZvciBsb25nZXIsIGJ1dCB1bmRlciBhbiBvbGRlciBQeXRob24taW5zcGlyZWQgZm9ybS4gIFRoaXMgZnVuY3Rpb25cbiAqIHdvcmtzIG9uIGJvdGgga2luZHMgb2YgZ2VuZXJhdG9ycy5cbiAqXG4gKiBEZWNvcmF0ZXMgYSBnZW5lcmF0b3IgZnVuY3Rpb24gc3VjaCB0aGF0OlxuICogIC0gaXQgbWF5IHlpZWxkIHByb21pc2VzXG4gKiAgLSBleGVjdXRpb24gd2lsbCBjb250aW51ZSB3aGVuIHRoYXQgcHJvbWlzZSBpcyBmdWxmaWxsZWRcbiAqICAtIHRoZSB2YWx1ZSBvZiB0aGUgeWllbGQgZXhwcmVzc2lvbiB3aWxsIGJlIHRoZSBmdWxmaWxsZWQgdmFsdWVcbiAqICAtIGl0IHJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgcmV0dXJuIHZhbHVlICh3aGVuIHRoZSBnZW5lcmF0b3JcbiAqICAgIHN0b3BzIGl0ZXJhdGluZylcbiAqICAtIHRoZSBkZWNvcmF0ZWQgZnVuY3Rpb24gcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWVcbiAqICAgIG9mIHRoZSBnZW5lcmF0b3Igb3IgdGhlIGZpcnN0IHJlamVjdGVkIHByb21pc2UgYW1vbmcgdGhvc2VcbiAqICAgIHlpZWxkZWQuXG4gKiAgLSBpZiBhbiBlcnJvciBpcyB0aHJvd24gaW4gdGhlIGdlbmVyYXRvciwgaXQgcHJvcGFnYXRlcyB0aHJvdWdoXG4gKiAgICBldmVyeSBmb2xsb3dpbmcgeWllbGQgdW50aWwgaXQgaXMgY2F1Z2h0LCBvciB1bnRpbCBpdCBlc2NhcGVzXG4gKiAgICB0aGUgZ2VuZXJhdG9yIGZ1bmN0aW9uIGFsdG9nZXRoZXIsIGFuZCBpcyB0cmFuc2xhdGVkIGludG8gYVxuICogICAgcmVqZWN0aW9uIGZvciB0aGUgcHJvbWlzZSByZXR1cm5lZCBieSB0aGUgZGVjb3JhdGVkIGdlbmVyYXRvci5cbiAqL1xuUS5hc3luYyA9IGFzeW5jO1xuZnVuY3Rpb24gYXN5bmMobWFrZUdlbmVyYXRvcikge1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIHdoZW4gdmVyYiBpcyBcInNlbmRcIiwgYXJnIGlzIGEgdmFsdWVcbiAgICAgICAgLy8gd2hlbiB2ZXJiIGlzIFwidGhyb3dcIiwgYXJnIGlzIGFuIGV4Y2VwdGlvblxuICAgICAgICBmdW5jdGlvbiBjb250aW51ZXIodmVyYiwgYXJnKSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0O1xuICAgICAgICAgICAgaWYgKGhhc0VTNkdlbmVyYXRvcnMpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSBnZW5lcmF0b3JbdmVyYl0oYXJnKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChleGNlcHRpb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LmRvbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdC52YWx1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gd2hlbihyZXN1bHQudmFsdWUsIGNhbGxiYWNrLCBlcnJiYWNrKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEZJWE1FOiBSZW1vdmUgdGhpcyBjYXNlIHdoZW4gU00gZG9lcyBFUzYgZ2VuZXJhdG9ycy5cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSBnZW5lcmF0b3JbdmVyYl0oYXJnKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzU3RvcEl0ZXJhdGlvbihleGNlcHRpb24pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXhjZXB0aW9uLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChleGNlcHRpb24pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB3aGVuKHJlc3VsdCwgY2FsbGJhY2ssIGVycmJhY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHZhciBnZW5lcmF0b3IgPSBtYWtlR2VuZXJhdG9yLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGNvbnRpbnVlci5iaW5kKGNvbnRpbnVlciwgXCJuZXh0XCIpO1xuICAgICAgICB2YXIgZXJyYmFjayA9IGNvbnRpbnVlci5iaW5kKGNvbnRpbnVlciwgXCJ0aHJvd1wiKTtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgfTtcbn1cblxuLyoqXG4gKiBUaGUgc3Bhd24gZnVuY3Rpb24gaXMgYSBzbWFsbCB3cmFwcGVyIGFyb3VuZCBhc3luYyB0aGF0IGltbWVkaWF0ZWx5XG4gKiBjYWxscyB0aGUgZ2VuZXJhdG9yIGFuZCBhbHNvIGVuZHMgdGhlIHByb21pc2UgY2hhaW4sIHNvIHRoYXQgYW55XG4gKiB1bmhhbmRsZWQgZXJyb3JzIGFyZSB0aHJvd24gaW5zdGVhZCBvZiBmb3J3YXJkZWQgdG8gdGhlIGVycm9yXG4gKiBoYW5kbGVyLiBUaGlzIGlzIHVzZWZ1bCBiZWNhdXNlIGl0J3MgZXh0cmVtZWx5IGNvbW1vbiB0byBydW5cbiAqIGdlbmVyYXRvcnMgYXQgdGhlIHRvcC1sZXZlbCB0byB3b3JrIHdpdGggbGlicmFyaWVzLlxuICovXG5RLnNwYXduID0gc3Bhd247XG5mdW5jdGlvbiBzcGF3bihtYWtlR2VuZXJhdG9yKSB7XG4gICAgUS5kb25lKFEuYXN5bmMobWFrZUdlbmVyYXRvcikoKSk7XG59XG5cbi8vIEZJWE1FOiBSZW1vdmUgdGhpcyBpbnRlcmZhY2Ugb25jZSBFUzYgZ2VuZXJhdG9ycyBhcmUgaW4gU3BpZGVyTW9ua2V5LlxuLyoqXG4gKiBUaHJvd3MgYSBSZXR1cm5WYWx1ZSBleGNlcHRpb24gdG8gc3RvcCBhbiBhc3luY2hyb25vdXMgZ2VuZXJhdG9yLlxuICpcbiAqIFRoaXMgaW50ZXJmYWNlIGlzIGEgc3RvcC1nYXAgbWVhc3VyZSB0byBzdXBwb3J0IGdlbmVyYXRvciByZXR1cm5cbiAqIHZhbHVlcyBpbiBvbGRlciBGaXJlZm94L1NwaWRlck1vbmtleS4gIEluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBFUzZcbiAqIGdlbmVyYXRvcnMgbGlrZSBDaHJvbWl1bSAyOSwganVzdCB1c2UgXCJyZXR1cm5cIiBpbiB5b3VyIGdlbmVyYXRvclxuICogZnVuY3Rpb25zLlxuICpcbiAqIEBwYXJhbSB2YWx1ZSB0aGUgcmV0dXJuIHZhbHVlIGZvciB0aGUgc3Vycm91bmRpbmcgZ2VuZXJhdG9yXG4gKiBAdGhyb3dzIFJldHVyblZhbHVlIGV4Y2VwdGlvbiB3aXRoIHRoZSB2YWx1ZS5cbiAqIEBleGFtcGxlXG4gKiAvLyBFUzYgc3R5bGVcbiAqIFEuYXN5bmMoZnVuY3Rpb24qICgpIHtcbiAqICAgICAgdmFyIGZvbyA9IHlpZWxkIGdldEZvb1Byb21pc2UoKTtcbiAqICAgICAgdmFyIGJhciA9IHlpZWxkIGdldEJhclByb21pc2UoKTtcbiAqICAgICAgcmV0dXJuIGZvbyArIGJhcjtcbiAqIH0pXG4gKiAvLyBPbGRlciBTcGlkZXJNb25rZXkgc3R5bGVcbiAqIFEuYXN5bmMoZnVuY3Rpb24gKCkge1xuICogICAgICB2YXIgZm9vID0geWllbGQgZ2V0Rm9vUHJvbWlzZSgpO1xuICogICAgICB2YXIgYmFyID0geWllbGQgZ2V0QmFyUHJvbWlzZSgpO1xuICogICAgICBRLnJldHVybihmb28gKyBiYXIpO1xuICogfSlcbiAqL1xuUVtcInJldHVyblwiXSA9IF9yZXR1cm47XG5mdW5jdGlvbiBfcmV0dXJuKHZhbHVlKSB7XG4gICAgdGhyb3cgbmV3IFFSZXR1cm5WYWx1ZSh2YWx1ZSk7XG59XG5cbi8qKlxuICogVGhlIHByb21pc2VkIGZ1bmN0aW9uIGRlY29yYXRvciBlbnN1cmVzIHRoYXQgYW55IHByb21pc2UgYXJndW1lbnRzXG4gKiBhcmUgc2V0dGxlZCBhbmQgcGFzc2VkIGFzIHZhbHVlcyAoYHRoaXNgIGlzIGFsc28gc2V0dGxlZCBhbmQgcGFzc2VkXG4gKiBhcyBhIHZhbHVlKS4gIEl0IHdpbGwgYWxzbyBlbnN1cmUgdGhhdCB0aGUgcmVzdWx0IG9mIGEgZnVuY3Rpb24gaXNcbiAqIGFsd2F5cyBhIHByb21pc2UuXG4gKlxuICogQGV4YW1wbGVcbiAqIHZhciBhZGQgPSBRLnByb21pc2VkKGZ1bmN0aW9uIChhLCBiKSB7XG4gKiAgICAgcmV0dXJuIGEgKyBiO1xuICogfSk7XG4gKiBhZGQoUShhKSwgUShCKSk7XG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRvIGRlY29yYXRlXG4gKiBAcmV0dXJucyB7ZnVuY3Rpb259IGEgZnVuY3Rpb24gdGhhdCBoYXMgYmVlbiBkZWNvcmF0ZWQuXG4gKi9cblEucHJvbWlzZWQgPSBwcm9taXNlZDtcbmZ1bmN0aW9uIHByb21pc2VkKGNhbGxiYWNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHNwcmVhZChbdGhpcywgYWxsKGFyZ3VtZW50cyldLCBmdW5jdGlvbiAoc2VsZiwgYXJncykge1xuICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICAgICAgICB9KTtcbiAgICB9O1xufVxuXG4vKipcbiAqIHNlbmRzIGEgbWVzc2FnZSB0byBhIHZhbHVlIGluIGEgZnV0dXJlIHR1cm5cbiAqIEBwYXJhbSBvYmplY3QqIHRoZSByZWNpcGllbnRcbiAqIEBwYXJhbSBvcCB0aGUgbmFtZSBvZiB0aGUgbWVzc2FnZSBvcGVyYXRpb24sIGUuZy4sIFwid2hlblwiLFxuICogQHBhcmFtIGFyZ3MgZnVydGhlciBhcmd1bWVudHMgdG8gYmUgZm9yd2FyZGVkIHRvIHRoZSBvcGVyYXRpb25cbiAqIEByZXR1cm5zIHJlc3VsdCB7UHJvbWlzZX0gYSBwcm9taXNlIGZvciB0aGUgcmVzdWx0IG9mIHRoZSBvcGVyYXRpb25cbiAqL1xuUS5kaXNwYXRjaCA9IGRpc3BhdGNoO1xuZnVuY3Rpb24gZGlzcGF0Y2gob2JqZWN0LCBvcCwgYXJncykge1xuICAgIHJldHVybiBRKG9iamVjdCkuZGlzcGF0Y2gob3AsIGFyZ3MpO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS5kaXNwYXRjaCA9IGZ1bmN0aW9uIChvcCwgYXJncykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgIG5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc2VsZi5wcm9taXNlRGlzcGF0Y2goZGVmZXJyZWQucmVzb2x2ZSwgb3AsIGFyZ3MpO1xuICAgIH0pO1xuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufTtcblxuLyoqXG4gKiBHZXRzIHRoZSB2YWx1ZSBvZiBhIHByb3BlcnR5IGluIGEgZnV0dXJlIHR1cm4uXG4gKiBAcGFyYW0gb2JqZWN0ICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSBmb3IgdGFyZ2V0IG9iamVjdFxuICogQHBhcmFtIG5hbWUgICAgICBuYW1lIG9mIHByb3BlcnR5IHRvIGdldFxuICogQHJldHVybiBwcm9taXNlIGZvciB0aGUgcHJvcGVydHkgdmFsdWVcbiAqL1xuUS5nZXQgPSBmdW5jdGlvbiAob2JqZWN0LCBrZXkpIHtcbiAgICByZXR1cm4gUShvYmplY3QpLmRpc3BhdGNoKFwiZ2V0XCIsIFtrZXldKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gdGhpcy5kaXNwYXRjaChcImdldFwiLCBba2V5XSk7XG59O1xuXG4vKipcbiAqIFNldHMgdGhlIHZhbHVlIG9mIGEgcHJvcGVydHkgaW4gYSBmdXR1cmUgdHVybi5cbiAqIEBwYXJhbSBvYmplY3QgICAgcHJvbWlzZSBvciBpbW1lZGlhdGUgcmVmZXJlbmNlIGZvciBvYmplY3Qgb2JqZWN0XG4gKiBAcGFyYW0gbmFtZSAgICAgIG5hbWUgb2YgcHJvcGVydHkgdG8gc2V0XG4gKiBAcGFyYW0gdmFsdWUgICAgIG5ldyB2YWx1ZSBvZiBwcm9wZXJ0eVxuICogQHJldHVybiBwcm9taXNlIGZvciB0aGUgcmV0dXJuIHZhbHVlXG4gKi9cblEuc2V0ID0gZnVuY3Rpb24gKG9iamVjdCwga2V5LCB2YWx1ZSkge1xuICAgIHJldHVybiBRKG9iamVjdCkuZGlzcGF0Y2goXCJzZXRcIiwgW2tleSwgdmFsdWVdKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uIChrZXksIHZhbHVlKSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcGF0Y2goXCJzZXRcIiwgW2tleSwgdmFsdWVdKTtcbn07XG5cbi8qKlxuICogRGVsZXRlcyBhIHByb3BlcnR5IGluIGEgZnV0dXJlIHR1cm4uXG4gKiBAcGFyYW0gb2JqZWN0ICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSBmb3IgdGFyZ2V0IG9iamVjdFxuICogQHBhcmFtIG5hbWUgICAgICBuYW1lIG9mIHByb3BlcnR5IHRvIGRlbGV0ZVxuICogQHJldHVybiBwcm9taXNlIGZvciB0aGUgcmV0dXJuIHZhbHVlXG4gKi9cblEuZGVsID0gLy8gWFhYIGxlZ2FjeVxuUVtcImRlbGV0ZVwiXSA9IGZ1bmN0aW9uIChvYmplY3QsIGtleSkge1xuICAgIHJldHVybiBRKG9iamVjdCkuZGlzcGF0Y2goXCJkZWxldGVcIiwgW2tleV0pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZGVsID0gLy8gWFhYIGxlZ2FjeVxuUHJvbWlzZS5wcm90b3R5cGVbXCJkZWxldGVcIl0gPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcGF0Y2goXCJkZWxldGVcIiwgW2tleV0pO1xufTtcblxuLyoqXG4gKiBJbnZva2VzIGEgbWV0aG9kIGluIGEgZnV0dXJlIHR1cm4uXG4gKiBAcGFyYW0gb2JqZWN0ICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSBmb3IgdGFyZ2V0IG9iamVjdFxuICogQHBhcmFtIG5hbWUgICAgICBuYW1lIG9mIG1ldGhvZCB0byBpbnZva2VcbiAqIEBwYXJhbSB2YWx1ZSAgICAgYSB2YWx1ZSB0byBwb3N0LCB0eXBpY2FsbHkgYW4gYXJyYXkgb2ZcbiAqICAgICAgICAgICAgICAgICAgaW52b2NhdGlvbiBhcmd1bWVudHMgZm9yIHByb21pc2VzIHRoYXRcbiAqICAgICAgICAgICAgICAgICAgYXJlIHVsdGltYXRlbHkgYmFja2VkIHdpdGggYHJlc29sdmVgIHZhbHVlcyxcbiAqICAgICAgICAgICAgICAgICAgYXMgb3Bwb3NlZCB0byB0aG9zZSBiYWNrZWQgd2l0aCBVUkxzXG4gKiAgICAgICAgICAgICAgICAgIHdoZXJlaW4gdGhlIHBvc3RlZCB2YWx1ZSBjYW4gYmUgYW55XG4gKiAgICAgICAgICAgICAgICAgIEpTT04gc2VyaWFsaXphYmxlIG9iamVjdC5cbiAqIEByZXR1cm4gcHJvbWlzZSBmb3IgdGhlIHJldHVybiB2YWx1ZVxuICovXG4vLyBib3VuZCBsb2NhbGx5IGJlY2F1c2UgaXQgaXMgdXNlZCBieSBvdGhlciBtZXRob2RzXG5RLm1hcHBseSA9IC8vIFhYWCBBcyBwcm9wb3NlZCBieSBcIlJlZHNhbmRyb1wiXG5RLnBvc3QgPSBmdW5jdGlvbiAob2JqZWN0LCBuYW1lLCBhcmdzKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChcInBvc3RcIiwgW25hbWUsIGFyZ3NdKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLm1hcHBseSA9IC8vIFhYWCBBcyBwcm9wb3NlZCBieSBcIlJlZHNhbmRyb1wiXG5Qcm9taXNlLnByb3RvdHlwZS5wb3N0ID0gZnVuY3Rpb24gKG5hbWUsIGFyZ3MpIHtcbiAgICByZXR1cm4gdGhpcy5kaXNwYXRjaChcInBvc3RcIiwgW25hbWUsIGFyZ3NdKTtcbn07XG5cbi8qKlxuICogSW52b2tlcyBhIG1ldGhvZCBpbiBhIGZ1dHVyZSB0dXJuLlxuICogQHBhcmFtIG9iamVjdCAgICBwcm9taXNlIG9yIGltbWVkaWF0ZSByZWZlcmVuY2UgZm9yIHRhcmdldCBvYmplY3RcbiAqIEBwYXJhbSBuYW1lICAgICAgbmFtZSBvZiBtZXRob2QgdG8gaW52b2tlXG4gKiBAcGFyYW0gLi4uYXJncyAgIGFycmF5IG9mIGludm9jYXRpb24gYXJndW1lbnRzXG4gKiBAcmV0dXJuIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWVcbiAqL1xuUS5zZW5kID0gLy8gWFhYIE1hcmsgTWlsbGVyJ3MgcHJvcG9zZWQgcGFybGFuY2VcblEubWNhbGwgPSAvLyBYWFggQXMgcHJvcG9zZWQgYnkgXCJSZWRzYW5kcm9cIlxuUS5pbnZva2UgPSBmdW5jdGlvbiAob2JqZWN0LCBuYW1lIC8qLi4uYXJncyovKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChcInBvc3RcIiwgW25hbWUsIGFycmF5X3NsaWNlKGFyZ3VtZW50cywgMildKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLnNlbmQgPSAvLyBYWFggTWFyayBNaWxsZXIncyBwcm9wb3NlZCBwYXJsYW5jZVxuUHJvbWlzZS5wcm90b3R5cGUubWNhbGwgPSAvLyBYWFggQXMgcHJvcG9zZWQgYnkgXCJSZWRzYW5kcm9cIlxuUHJvbWlzZS5wcm90b3R5cGUuaW52b2tlID0gZnVuY3Rpb24gKG5hbWUgLyouLi5hcmdzKi8pIHtcbiAgICByZXR1cm4gdGhpcy5kaXNwYXRjaChcInBvc3RcIiwgW25hbWUsIGFycmF5X3NsaWNlKGFyZ3VtZW50cywgMSldKTtcbn07XG5cbi8qKlxuICogQXBwbGllcyB0aGUgcHJvbWlzZWQgZnVuY3Rpb24gaW4gYSBmdXR1cmUgdHVybi5cbiAqIEBwYXJhbSBvYmplY3QgICAgcHJvbWlzZSBvciBpbW1lZGlhdGUgcmVmZXJlbmNlIGZvciB0YXJnZXQgZnVuY3Rpb25cbiAqIEBwYXJhbSBhcmdzICAgICAgYXJyYXkgb2YgYXBwbGljYXRpb24gYXJndW1lbnRzXG4gKi9cblEuZmFwcGx5ID0gZnVuY3Rpb24gKG9iamVjdCwgYXJncykge1xuICAgIHJldHVybiBRKG9iamVjdCkuZGlzcGF0Y2goXCJhcHBseVwiLCBbdm9pZCAwLCBhcmdzXSk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5mYXBwbHkgPSBmdW5jdGlvbiAoYXJncykge1xuICAgIHJldHVybiB0aGlzLmRpc3BhdGNoKFwiYXBwbHlcIiwgW3ZvaWQgMCwgYXJnc10pO1xufTtcblxuLyoqXG4gKiBDYWxscyB0aGUgcHJvbWlzZWQgZnVuY3Rpb24gaW4gYSBmdXR1cmUgdHVybi5cbiAqIEBwYXJhbSBvYmplY3QgICAgcHJvbWlzZSBvciBpbW1lZGlhdGUgcmVmZXJlbmNlIGZvciB0YXJnZXQgZnVuY3Rpb25cbiAqIEBwYXJhbSAuLi5hcmdzICAgYXJyYXkgb2YgYXBwbGljYXRpb24gYXJndW1lbnRzXG4gKi9cblFbXCJ0cnlcIl0gPVxuUS5mY2FsbCA9IGZ1bmN0aW9uIChvYmplY3QgLyogLi4uYXJncyovKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChcImFwcGx5XCIsIFt2b2lkIDAsIGFycmF5X3NsaWNlKGFyZ3VtZW50cywgMSldKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLmZjYWxsID0gZnVuY3Rpb24gKC8qLi4uYXJncyovKSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcGF0Y2goXCJhcHBseVwiLCBbdm9pZCAwLCBhcnJheV9zbGljZShhcmd1bWVudHMpXSk7XG59O1xuXG4vKipcbiAqIEJpbmRzIHRoZSBwcm9taXNlZCBmdW5jdGlvbiwgdHJhbnNmb3JtaW5nIHJldHVybiB2YWx1ZXMgaW50byBhIGZ1bGZpbGxlZFxuICogcHJvbWlzZSBhbmQgdGhyb3duIGVycm9ycyBpbnRvIGEgcmVqZWN0ZWQgb25lLlxuICogQHBhcmFtIG9iamVjdCAgICBwcm9taXNlIG9yIGltbWVkaWF0ZSByZWZlcmVuY2UgZm9yIHRhcmdldCBmdW5jdGlvblxuICogQHBhcmFtIC4uLmFyZ3MgICBhcnJheSBvZiBhcHBsaWNhdGlvbiBhcmd1bWVudHNcbiAqL1xuUS5mYmluZCA9IGZ1bmN0aW9uIChvYmplY3QgLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgcHJvbWlzZSA9IFEob2JqZWN0KTtcbiAgICB2YXIgYXJncyA9IGFycmF5X3NsaWNlKGFyZ3VtZW50cywgMSk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIGZib3VuZCgpIHtcbiAgICAgICAgcmV0dXJuIHByb21pc2UuZGlzcGF0Y2goXCJhcHBseVwiLCBbXG4gICAgICAgICAgICB0aGlzLFxuICAgICAgICAgICAgYXJncy5jb25jYXQoYXJyYXlfc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgXSk7XG4gICAgfTtcbn07XG5Qcm9taXNlLnByb3RvdHlwZS5mYmluZCA9IGZ1bmN0aW9uICgvKi4uLmFyZ3MqLykge1xuICAgIHZhciBwcm9taXNlID0gdGhpcztcbiAgICB2YXIgYXJncyA9IGFycmF5X3NsaWNlKGFyZ3VtZW50cyk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIGZib3VuZCgpIHtcbiAgICAgICAgcmV0dXJuIHByb21pc2UuZGlzcGF0Y2goXCJhcHBseVwiLCBbXG4gICAgICAgICAgICB0aGlzLFxuICAgICAgICAgICAgYXJncy5jb25jYXQoYXJyYXlfc2xpY2UoYXJndW1lbnRzKSlcbiAgICAgICAgXSk7XG4gICAgfTtcbn07XG5cbi8qKlxuICogUmVxdWVzdHMgdGhlIG5hbWVzIG9mIHRoZSBvd25lZCBwcm9wZXJ0aWVzIG9mIGEgcHJvbWlzZWRcbiAqIG9iamVjdCBpbiBhIGZ1dHVyZSB0dXJuLlxuICogQHBhcmFtIG9iamVjdCAgICBwcm9taXNlIG9yIGltbWVkaWF0ZSByZWZlcmVuY2UgZm9yIHRhcmdldCBvYmplY3RcbiAqIEByZXR1cm4gcHJvbWlzZSBmb3IgdGhlIGtleXMgb2YgdGhlIGV2ZW50dWFsbHkgc2V0dGxlZCBvYmplY3RcbiAqL1xuUS5rZXlzID0gZnVuY3Rpb24gKG9iamVjdCkge1xuICAgIHJldHVybiBRKG9iamVjdCkuZGlzcGF0Y2goXCJrZXlzXCIsIFtdKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLmtleXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcGF0Y2goXCJrZXlzXCIsIFtdKTtcbn07XG5cbi8qKlxuICogVHVybnMgYW4gYXJyYXkgb2YgcHJvbWlzZXMgaW50byBhIHByb21pc2UgZm9yIGFuIGFycmF5LiAgSWYgYW55IG9mXG4gKiB0aGUgcHJvbWlzZXMgZ2V0cyByZWplY3RlZCwgdGhlIHdob2xlIGFycmF5IGlzIHJlamVjdGVkIGltbWVkaWF0ZWx5LlxuICogQHBhcmFtIHtBcnJheSp9IGFuIGFycmF5IChvciBwcm9taXNlIGZvciBhbiBhcnJheSkgb2YgdmFsdWVzIChvclxuICogcHJvbWlzZXMgZm9yIHZhbHVlcylcbiAqIEByZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gYXJyYXkgb2YgdGhlIGNvcnJlc3BvbmRpbmcgdmFsdWVzXG4gKi9cbi8vIEJ5IE1hcmsgTWlsbGVyXG4vLyBodHRwOi8vd2lraS5lY21hc2NyaXB0Lm9yZy9kb2t1LnBocD9pZD1zdHJhd21hbjpjb25jdXJyZW5jeSZyZXY9MTMwODc3NjUyMSNhbGxmdWxmaWxsZWRcblEuYWxsID0gYWxsO1xuZnVuY3Rpb24gYWxsKHByb21pc2VzKSB7XG4gICAgcmV0dXJuIHdoZW4ocHJvbWlzZXMsIGZ1bmN0aW9uIChwcm9taXNlcykge1xuICAgICAgICB2YXIgY291bnREb3duID0gMDtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICAgICAgYXJyYXlfcmVkdWNlKHByb21pc2VzLCBmdW5jdGlvbiAodW5kZWZpbmVkLCBwcm9taXNlLCBpbmRleCkge1xuICAgICAgICAgICAgdmFyIHNuYXBzaG90O1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIGlzUHJvbWlzZShwcm9taXNlKSAmJlxuICAgICAgICAgICAgICAgIChzbmFwc2hvdCA9IHByb21pc2UuaW5zcGVjdCgpKS5zdGF0ZSA9PT0gXCJmdWxmaWxsZWRcIlxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcHJvbWlzZXNbaW5kZXhdID0gc25hcHNob3QudmFsdWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICsrY291bnREb3duO1xuICAgICAgICAgICAgICAgIHdoZW4oXG4gICAgICAgICAgICAgICAgICAgIHByb21pc2UsXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJvbWlzZXNbaW5kZXhdID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoLS1jb3VudERvd24gPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHByb21pc2VzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0LFxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiAocHJvZ3Jlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeSh7IGluZGV4OiBpbmRleCwgdmFsdWU6IHByb2dyZXNzIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdm9pZCAwKTtcbiAgICAgICAgaWYgKGNvdW50RG93biA9PT0gMCkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShwcm9taXNlcyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfSk7XG59XG5cblByb21pc2UucHJvdG90eXBlLmFsbCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gYWxsKHRoaXMpO1xufTtcblxuLyoqXG4gKiBXYWl0cyBmb3IgYWxsIHByb21pc2VzIHRvIGJlIHNldHRsZWQsIGVpdGhlciBmdWxmaWxsZWQgb3JcbiAqIHJlamVjdGVkLiAgVGhpcyBpcyBkaXN0aW5jdCBmcm9tIGBhbGxgIHNpbmNlIHRoYXQgd291bGQgc3RvcFxuICogd2FpdGluZyBhdCB0aGUgZmlyc3QgcmVqZWN0aW9uLiAgVGhlIHByb21pc2UgcmV0dXJuZWQgYnlcbiAqIGBhbGxSZXNvbHZlZGAgd2lsbCBuZXZlciBiZSByZWplY3RlZC5cbiAqIEBwYXJhbSBwcm9taXNlcyBhIHByb21pc2UgZm9yIGFuIGFycmF5IChvciBhbiBhcnJheSkgb2YgcHJvbWlzZXNcbiAqIChvciB2YWx1ZXMpXG4gKiBAcmV0dXJuIGEgcHJvbWlzZSBmb3IgYW4gYXJyYXkgb2YgcHJvbWlzZXNcbiAqL1xuUS5hbGxSZXNvbHZlZCA9IGRlcHJlY2F0ZShhbGxSZXNvbHZlZCwgXCJhbGxSZXNvbHZlZFwiLCBcImFsbFNldHRsZWRcIik7XG5mdW5jdGlvbiBhbGxSZXNvbHZlZChwcm9taXNlcykge1xuICAgIHJldHVybiB3aGVuKHByb21pc2VzLCBmdW5jdGlvbiAocHJvbWlzZXMpIHtcbiAgICAgICAgcHJvbWlzZXMgPSBhcnJheV9tYXAocHJvbWlzZXMsIFEpO1xuICAgICAgICByZXR1cm4gd2hlbihhbGwoYXJyYXlfbWFwKHByb21pc2VzLCBmdW5jdGlvbiAocHJvbWlzZSkge1xuICAgICAgICAgICAgcmV0dXJuIHdoZW4ocHJvbWlzZSwgbm9vcCwgbm9vcCk7XG4gICAgICAgIH0pKSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHByb21pc2VzO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUuYWxsUmVzb2x2ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIGFsbFJlc29sdmVkKHRoaXMpO1xufTtcblxuLyoqXG4gKiBAc2VlIFByb21pc2UjYWxsU2V0dGxlZFxuICovXG5RLmFsbFNldHRsZWQgPSBhbGxTZXR0bGVkO1xuZnVuY3Rpb24gYWxsU2V0dGxlZChwcm9taXNlcykge1xuICAgIHJldHVybiBRKHByb21pc2VzKS5hbGxTZXR0bGVkKCk7XG59XG5cbi8qKlxuICogVHVybnMgYW4gYXJyYXkgb2YgcHJvbWlzZXMgaW50byBhIHByb21pc2UgZm9yIGFuIGFycmF5IG9mIHRoZWlyIHN0YXRlcyAoYXNcbiAqIHJldHVybmVkIGJ5IGBpbnNwZWN0YCkgd2hlbiB0aGV5IGhhdmUgYWxsIHNldHRsZWQuXG4gKiBAcGFyYW0ge0FycmF5W0FueSpdfSB2YWx1ZXMgYW4gYXJyYXkgKG9yIHByb21pc2UgZm9yIGFuIGFycmF5KSBvZiB2YWx1ZXMgKG9yXG4gKiBwcm9taXNlcyBmb3IgdmFsdWVzKVxuICogQHJldHVybnMge0FycmF5W1N0YXRlXX0gYW4gYXJyYXkgb2Ygc3RhdGVzIGZvciB0aGUgcmVzcGVjdGl2ZSB2YWx1ZXMuXG4gKi9cblByb21pc2UucHJvdG90eXBlLmFsbFNldHRsZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMudGhlbihmdW5jdGlvbiAocHJvbWlzZXMpIHtcbiAgICAgICAgcmV0dXJuIGFsbChhcnJheV9tYXAocHJvbWlzZXMsIGZ1bmN0aW9uIChwcm9taXNlKSB7XG4gICAgICAgICAgICBwcm9taXNlID0gUShwcm9taXNlKTtcbiAgICAgICAgICAgIGZ1bmN0aW9uIHJlZ2FyZGxlc3MoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHByb21pc2UuaW5zcGVjdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbihyZWdhcmRsZXNzLCByZWdhcmRsZXNzKTtcbiAgICAgICAgfSkpO1xuICAgIH0pO1xufTtcblxuLyoqXG4gKiBDYXB0dXJlcyB0aGUgZmFpbHVyZSBvZiBhIHByb21pc2UsIGdpdmluZyBhbiBvcG9ydHVuaXR5IHRvIHJlY292ZXJcbiAqIHdpdGggYSBjYWxsYmFjay4gIElmIHRoZSBnaXZlbiBwcm9taXNlIGlzIGZ1bGZpbGxlZCwgdGhlIHJldHVybmVkXG4gKiBwcm9taXNlIGlzIGZ1bGZpbGxlZC5cbiAqIEBwYXJhbSB7QW55Kn0gcHJvbWlzZSBmb3Igc29tZXRoaW5nXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayB0byBmdWxmaWxsIHRoZSByZXR1cm5lZCBwcm9taXNlIGlmIHRoZVxuICogZ2l2ZW4gcHJvbWlzZSBpcyByZWplY3RlZFxuICogQHJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgcmV0dXJuIHZhbHVlIG9mIHRoZSBjYWxsYmFja1xuICovXG5RLmZhaWwgPSAvLyBYWFggbGVnYWN5XG5RW1wiY2F0Y2hcIl0gPSBmdW5jdGlvbiAob2JqZWN0LCByZWplY3RlZCkge1xuICAgIHJldHVybiBRKG9iamVjdCkudGhlbih2b2lkIDAsIHJlamVjdGVkKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLmZhaWwgPSAvLyBYWFggbGVnYWN5XG5Qcm9taXNlLnByb3RvdHlwZVtcImNhdGNoXCJdID0gZnVuY3Rpb24gKHJlamVjdGVkKSB7XG4gICAgcmV0dXJuIHRoaXMudGhlbih2b2lkIDAsIHJlamVjdGVkKTtcbn07XG5cbi8qKlxuICogQXR0YWNoZXMgYSBsaXN0ZW5lciB0aGF0IGNhbiByZXNwb25kIHRvIHByb2dyZXNzIG5vdGlmaWNhdGlvbnMgZnJvbSBhXG4gKiBwcm9taXNlJ3Mgb3JpZ2luYXRpbmcgZGVmZXJyZWQuIFRoaXMgbGlzdGVuZXIgcmVjZWl2ZXMgdGhlIGV4YWN0IGFyZ3VtZW50c1xuICogcGFzc2VkIHRvIGBgZGVmZXJyZWQubm90aWZ5YGAuXG4gKiBAcGFyYW0ge0FueSp9IHByb21pc2UgZm9yIHNvbWV0aGluZ1xuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgdG8gcmVjZWl2ZSBhbnkgcHJvZ3Jlc3Mgbm90aWZpY2F0aW9uc1xuICogQHJldHVybnMgdGhlIGdpdmVuIHByb21pc2UsIHVuY2hhbmdlZFxuICovXG5RLnByb2dyZXNzID0gcHJvZ3Jlc3M7XG5mdW5jdGlvbiBwcm9ncmVzcyhvYmplY3QsIHByb2dyZXNzZWQpIHtcbiAgICByZXR1cm4gUShvYmplY3QpLnRoZW4odm9pZCAwLCB2b2lkIDAsIHByb2dyZXNzZWQpO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS5wcm9ncmVzcyA9IGZ1bmN0aW9uIChwcm9ncmVzc2VkKSB7XG4gICAgcmV0dXJuIHRoaXMudGhlbih2b2lkIDAsIHZvaWQgMCwgcHJvZ3Jlc3NlZCk7XG59O1xuXG4vKipcbiAqIFByb3ZpZGVzIGFuIG9wcG9ydHVuaXR5IHRvIG9ic2VydmUgdGhlIHNldHRsaW5nIG9mIGEgcHJvbWlzZSxcbiAqIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciB0aGUgcHJvbWlzZSBpcyBmdWxmaWxsZWQgb3IgcmVqZWN0ZWQuICBGb3J3YXJkc1xuICogdGhlIHJlc29sdXRpb24gdG8gdGhlIHJldHVybmVkIHByb21pc2Ugd2hlbiB0aGUgY2FsbGJhY2sgaXMgZG9uZS5cbiAqIFRoZSBjYWxsYmFjayBjYW4gcmV0dXJuIGEgcHJvbWlzZSB0byBkZWZlciBjb21wbGV0aW9uLlxuICogQHBhcmFtIHtBbnkqfSBwcm9taXNlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayB0byBvYnNlcnZlIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBnaXZlblxuICogcHJvbWlzZSwgdGFrZXMgbm8gYXJndW1lbnRzLlxuICogQHJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgcmVzb2x1dGlvbiBvZiB0aGUgZ2l2ZW4gcHJvbWlzZSB3aGVuXG4gKiBgYGZpbmBgIGlzIGRvbmUuXG4gKi9cblEuZmluID0gLy8gWFhYIGxlZ2FjeVxuUVtcImZpbmFsbHlcIl0gPSBmdW5jdGlvbiAob2JqZWN0LCBjYWxsYmFjaykge1xuICAgIHJldHVybiBRKG9iamVjdClbXCJmaW5hbGx5XCJdKGNhbGxiYWNrKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLmZpbiA9IC8vIFhYWCBsZWdhY3lcblByb21pc2UucHJvdG90eXBlW1wiZmluYWxseVwiXSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gUShjYWxsYmFjayk7XG4gICAgcmV0dXJuIHRoaXMudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmZjYWxsKCkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH0pO1xuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgLy8gVE9ETyBhdHRlbXB0IHRvIHJlY3ljbGUgdGhlIHJlamVjdGlvbiB3aXRoIFwidGhpc1wiLlxuICAgICAgICByZXR1cm4gY2FsbGJhY2suZmNhbGwoKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRocm93IHJlYXNvbjtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59O1xuXG4vKipcbiAqIFRlcm1pbmF0ZXMgYSBjaGFpbiBvZiBwcm9taXNlcywgZm9yY2luZyByZWplY3Rpb25zIHRvIGJlXG4gKiB0aHJvd24gYXMgZXhjZXB0aW9ucy5cbiAqIEBwYXJhbSB7QW55Kn0gcHJvbWlzZSBhdCB0aGUgZW5kIG9mIGEgY2hhaW4gb2YgcHJvbWlzZXNcbiAqIEByZXR1cm5zIG5vdGhpbmdcbiAqL1xuUS5kb25lID0gZnVuY3Rpb24gKG9iamVjdCwgZnVsZmlsbGVkLCByZWplY3RlZCwgcHJvZ3Jlc3MpIHtcbiAgICByZXR1cm4gUShvYmplY3QpLmRvbmUoZnVsZmlsbGVkLCByZWplY3RlZCwgcHJvZ3Jlc3MpO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZG9uZSA9IGZ1bmN0aW9uIChmdWxmaWxsZWQsIHJlamVjdGVkLCBwcm9ncmVzcykge1xuICAgIHZhciBvblVuaGFuZGxlZEVycm9yID0gZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICAgIC8vIGZvcndhcmQgdG8gYSBmdXR1cmUgdHVybiBzbyB0aGF0IGBgd2hlbmBgXG4gICAgICAgIC8vIGRvZXMgbm90IGNhdGNoIGl0IGFuZCB0dXJuIGl0IGludG8gYSByZWplY3Rpb24uXG4gICAgICAgIG5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIG1ha2VTdGFja1RyYWNlTG9uZyhlcnJvciwgcHJvbWlzZSk7XG4gICAgICAgICAgICBpZiAoUS5vbmVycm9yKSB7XG4gICAgICAgICAgICAgICAgUS5vbmVycm9yKGVycm9yKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAvLyBBdm9pZCB1bm5lY2Vzc2FyeSBgbmV4dFRpY2tgaW5nIHZpYSBhbiB1bm5lY2Vzc2FyeSBgd2hlbmAuXG4gICAgdmFyIHByb21pc2UgPSBmdWxmaWxsZWQgfHwgcmVqZWN0ZWQgfHwgcHJvZ3Jlc3MgP1xuICAgICAgICB0aGlzLnRoZW4oZnVsZmlsbGVkLCByZWplY3RlZCwgcHJvZ3Jlc3MpIDpcbiAgICAgICAgdGhpcztcblxuICAgIGlmICh0eXBlb2YgcHJvY2VzcyA9PT0gXCJvYmplY3RcIiAmJiBwcm9jZXNzICYmIHByb2Nlc3MuZG9tYWluKSB7XG4gICAgICAgIG9uVW5oYW5kbGVkRXJyb3IgPSBwcm9jZXNzLmRvbWFpbi5iaW5kKG9uVW5oYW5kbGVkRXJyb3IpO1xuICAgIH1cblxuICAgIHByb21pc2UudGhlbih2b2lkIDAsIG9uVW5oYW5kbGVkRXJyb3IpO1xufTtcblxuLyoqXG4gKiBDYXVzZXMgYSBwcm9taXNlIHRvIGJlIHJlamVjdGVkIGlmIGl0IGRvZXMgbm90IGdldCBmdWxmaWxsZWQgYmVmb3JlXG4gKiBzb21lIG1pbGxpc2Vjb25kcyB0aW1lIG91dC5cbiAqIEBwYXJhbSB7QW55Kn0gcHJvbWlzZVxuICogQHBhcmFtIHtOdW1iZXJ9IG1pbGxpc2Vjb25kcyB0aW1lb3V0XG4gKiBAcGFyYW0ge1N0cmluZ30gY3VzdG9tIGVycm9yIG1lc3NhZ2UgKG9wdGlvbmFsKVxuICogQHJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgcmVzb2x1dGlvbiBvZiB0aGUgZ2l2ZW4gcHJvbWlzZSBpZiBpdCBpc1xuICogZnVsZmlsbGVkIGJlZm9yZSB0aGUgdGltZW91dCwgb3RoZXJ3aXNlIHJlamVjdGVkLlxuICovXG5RLnRpbWVvdXQgPSBmdW5jdGlvbiAob2JqZWN0LCBtcywgbWVzc2FnZSkge1xuICAgIHJldHVybiBRKG9iamVjdCkudGltZW91dChtcywgbWVzc2FnZSk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS50aW1lb3V0ID0gZnVuY3Rpb24gKG1zLCBtZXNzYWdlKSB7XG4gICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICB2YXIgdGltZW91dElkID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgIGRlZmVycmVkLnJlamVjdChuZXcgRXJyb3IobWVzc2FnZSB8fCBcIlRpbWVkIG91dCBhZnRlciBcIiArIG1zICsgXCIgbXNcIikpO1xuICAgIH0sIG1zKTtcblxuICAgIHRoaXMudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICAgIGRlZmVycmVkLnJlc29sdmUodmFsdWUpO1xuICAgIH0sIGZ1bmN0aW9uIChleGNlcHRpb24pIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICAgIGRlZmVycmVkLnJlamVjdChleGNlcHRpb24pO1xuICAgIH0sIGRlZmVycmVkLm5vdGlmeSk7XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSBnaXZlbiB2YWx1ZSAob3IgcHJvbWlzZWQgdmFsdWUpLCBzb21lXG4gKiBtaWxsaXNlY29uZHMgYWZ0ZXIgaXQgcmVzb2x2ZWQuIFBhc3NlcyByZWplY3Rpb25zIGltbWVkaWF0ZWx5LlxuICogQHBhcmFtIHtBbnkqfSBwcm9taXNlXG4gKiBAcGFyYW0ge051bWJlcn0gbWlsbGlzZWNvbmRzXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBnaXZlbiBwcm9taXNlIGFmdGVyIG1pbGxpc2Vjb25kc1xuICogdGltZSBoYXMgZWxhcHNlZCBzaW5jZSB0aGUgcmVzb2x1dGlvbiBvZiB0aGUgZ2l2ZW4gcHJvbWlzZS5cbiAqIElmIHRoZSBnaXZlbiBwcm9taXNlIHJlamVjdHMsIHRoYXQgaXMgcGFzc2VkIGltbWVkaWF0ZWx5LlxuICovXG5RLmRlbGF5ID0gZnVuY3Rpb24gKG9iamVjdCwgdGltZW91dCkge1xuICAgIGlmICh0aW1lb3V0ID09PSB2b2lkIDApIHtcbiAgICAgICAgdGltZW91dCA9IG9iamVjdDtcbiAgICAgICAgb2JqZWN0ID0gdm9pZCAwO1xuICAgIH1cbiAgICByZXR1cm4gUShvYmplY3QpLmRlbGF5KHRpbWVvdXQpO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZGVsYXkgPSBmdW5jdGlvbiAodGltZW91dCkge1xuICAgIHJldHVybiB0aGlzLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgIH0sIHRpbWVvdXQpO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogUGFzc2VzIGEgY29udGludWF0aW9uIHRvIGEgTm9kZSBmdW5jdGlvbiwgd2hpY2ggaXMgY2FsbGVkIHdpdGggdGhlIGdpdmVuXG4gKiBhcmd1bWVudHMgcHJvdmlkZWQgYXMgYW4gYXJyYXksIGFuZCByZXR1cm5zIGEgcHJvbWlzZS5cbiAqXG4gKiAgICAgIFEubmZhcHBseShGUy5yZWFkRmlsZSwgW19fZmlsZW5hbWVdKVxuICogICAgICAudGhlbihmdW5jdGlvbiAoY29udGVudCkge1xuICogICAgICB9KVxuICpcbiAqL1xuUS5uZmFwcGx5ID0gZnVuY3Rpb24gKGNhbGxiYWNrLCBhcmdzKSB7XG4gICAgcmV0dXJuIFEoY2FsbGJhY2spLm5mYXBwbHkoYXJncyk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5uZmFwcGx5ID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgIHZhciBub2RlQXJncyA9IGFycmF5X3NsaWNlKGFyZ3MpO1xuICAgIG5vZGVBcmdzLnB1c2goZGVmZXJyZWQubWFrZU5vZGVSZXNvbHZlcigpKTtcbiAgICB0aGlzLmZhcHBseShub2RlQXJncykuZmFpbChkZWZlcnJlZC5yZWplY3QpO1xuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufTtcblxuLyoqXG4gKiBQYXNzZXMgYSBjb250aW51YXRpb24gdG8gYSBOb2RlIGZ1bmN0aW9uLCB3aGljaCBpcyBjYWxsZWQgd2l0aCB0aGUgZ2l2ZW5cbiAqIGFyZ3VtZW50cyBwcm92aWRlZCBpbmRpdmlkdWFsbHksIGFuZCByZXR1cm5zIGEgcHJvbWlzZS5cbiAqIEBleGFtcGxlXG4gKiBRLm5mY2FsbChGUy5yZWFkRmlsZSwgX19maWxlbmFtZSlcbiAqIC50aGVuKGZ1bmN0aW9uIChjb250ZW50KSB7XG4gKiB9KVxuICpcbiAqL1xuUS5uZmNhbGwgPSBmdW5jdGlvbiAoY2FsbGJhY2sgLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgYXJncyA9IGFycmF5X3NsaWNlKGFyZ3VtZW50cywgMSk7XG4gICAgcmV0dXJuIFEoY2FsbGJhY2spLm5mYXBwbHkoYXJncyk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5uZmNhbGwgPSBmdW5jdGlvbiAoLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgbm9kZUFyZ3MgPSBhcnJheV9zbGljZShhcmd1bWVudHMpO1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgbm9kZUFyZ3MucHVzaChkZWZlcnJlZC5tYWtlTm9kZVJlc29sdmVyKCkpO1xuICAgIHRoaXMuZmFwcGx5KG5vZGVBcmdzKS5mYWlsKGRlZmVycmVkLnJlamVjdCk7XG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG59O1xuXG4vKipcbiAqIFdyYXBzIGEgTm9kZUpTIGNvbnRpbnVhdGlvbiBwYXNzaW5nIGZ1bmN0aW9uIGFuZCByZXR1cm5zIGFuIGVxdWl2YWxlbnRcbiAqIHZlcnNpb24gdGhhdCByZXR1cm5zIGEgcHJvbWlzZS5cbiAqIEBleGFtcGxlXG4gKiBRLm5mYmluZChGUy5yZWFkRmlsZSwgX19maWxlbmFtZSkoXCJ1dGYtOFwiKVxuICogLnRoZW4oY29uc29sZS5sb2cpXG4gKiAuZG9uZSgpXG4gKi9cblEubmZiaW5kID1cblEuZGVub2RlaWZ5ID0gZnVuY3Rpb24gKGNhbGxiYWNrIC8qLi4uYXJncyovKSB7XG4gICAgdmFyIGJhc2VBcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgbm9kZUFyZ3MgPSBiYXNlQXJncy5jb25jYXQoYXJyYXlfc2xpY2UoYXJndW1lbnRzKSk7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgICAgIG5vZGVBcmdzLnB1c2goZGVmZXJyZWQubWFrZU5vZGVSZXNvbHZlcigpKTtcbiAgICAgICAgUShjYWxsYmFjaykuZmFwcGx5KG5vZGVBcmdzKS5mYWlsKGRlZmVycmVkLnJlamVjdCk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5uZmJpbmQgPVxuUHJvbWlzZS5wcm90b3R5cGUuZGVub2RlaWZ5ID0gZnVuY3Rpb24gKC8qLi4uYXJncyovKSB7XG4gICAgdmFyIGFyZ3MgPSBhcnJheV9zbGljZShhcmd1bWVudHMpO1xuICAgIGFyZ3MudW5zaGlmdCh0aGlzKTtcbiAgICByZXR1cm4gUS5kZW5vZGVpZnkuYXBwbHkodm9pZCAwLCBhcmdzKTtcbn07XG5cblEubmJpbmQgPSBmdW5jdGlvbiAoY2FsbGJhY2ssIHRoaXNwIC8qLi4uYXJncyovKSB7XG4gICAgdmFyIGJhc2VBcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAyKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgbm9kZUFyZ3MgPSBiYXNlQXJncy5jb25jYXQoYXJyYXlfc2xpY2UoYXJndW1lbnRzKSk7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgICAgIG5vZGVBcmdzLnB1c2goZGVmZXJyZWQubWFrZU5vZGVSZXNvbHZlcigpKTtcbiAgICAgICAgZnVuY3Rpb24gYm91bmQoKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2suYXBwbHkodGhpc3AsIGFyZ3VtZW50cyk7XG4gICAgICAgIH1cbiAgICAgICAgUShib3VuZCkuZmFwcGx5KG5vZGVBcmdzKS5mYWlsKGRlZmVycmVkLnJlamVjdCk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5uYmluZCA9IGZ1bmN0aW9uICgvKnRoaXNwLCAuLi5hcmdzKi8pIHtcbiAgICB2YXIgYXJncyA9IGFycmF5X3NsaWNlKGFyZ3VtZW50cywgMCk7XG4gICAgYXJncy51bnNoaWZ0KHRoaXMpO1xuICAgIHJldHVybiBRLm5iaW5kLmFwcGx5KHZvaWQgMCwgYXJncyk7XG59O1xuXG4vKipcbiAqIENhbGxzIGEgbWV0aG9kIG9mIGEgTm9kZS1zdHlsZSBvYmplY3QgdGhhdCBhY2NlcHRzIGEgTm9kZS1zdHlsZVxuICogY2FsbGJhY2sgd2l0aCBhIGdpdmVuIGFycmF5IG9mIGFyZ3VtZW50cywgcGx1cyBhIHByb3ZpZGVkIGNhbGxiYWNrLlxuICogQHBhcmFtIG9iamVjdCBhbiBvYmplY3QgdGhhdCBoYXMgdGhlIG5hbWVkIG1ldGhvZFxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgbmFtZSBvZiB0aGUgbWV0aG9kIG9mIG9iamVjdFxuICogQHBhcmFtIHtBcnJheX0gYXJncyBhcmd1bWVudHMgdG8gcGFzcyB0byB0aGUgbWV0aG9kOyB0aGUgY2FsbGJhY2tcbiAqIHdpbGwgYmUgcHJvdmlkZWQgYnkgUSBhbmQgYXBwZW5kZWQgdG8gdGhlc2UgYXJndW1lbnRzLlxuICogQHJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgdmFsdWUgb3IgZXJyb3JcbiAqL1xuUS5ubWFwcGx5ID0gLy8gWFhYIEFzIHByb3Bvc2VkIGJ5IFwiUmVkc2FuZHJvXCJcblEubnBvc3QgPSBmdW5jdGlvbiAob2JqZWN0LCBuYW1lLCBhcmdzKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5ucG9zdChuYW1lLCBhcmdzKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLm5tYXBwbHkgPSAvLyBYWFggQXMgcHJvcG9zZWQgYnkgXCJSZWRzYW5kcm9cIlxuUHJvbWlzZS5wcm90b3R5cGUubnBvc3QgPSBmdW5jdGlvbiAobmFtZSwgYXJncykge1xuICAgIHZhciBub2RlQXJncyA9IGFycmF5X3NsaWNlKGFyZ3MgfHwgW10pO1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgbm9kZUFyZ3MucHVzaChkZWZlcnJlZC5tYWtlTm9kZVJlc29sdmVyKCkpO1xuICAgIHRoaXMuZGlzcGF0Y2goXCJwb3N0XCIsIFtuYW1lLCBub2RlQXJnc10pLmZhaWwoZGVmZXJyZWQucmVqZWN0KTtcbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn07XG5cbi8qKlxuICogQ2FsbHMgYSBtZXRob2Qgb2YgYSBOb2RlLXN0eWxlIG9iamVjdCB0aGF0IGFjY2VwdHMgYSBOb2RlLXN0eWxlXG4gKiBjYWxsYmFjaywgZm9yd2FyZGluZyB0aGUgZ2l2ZW4gdmFyaWFkaWMgYXJndW1lbnRzLCBwbHVzIGEgcHJvdmlkZWRcbiAqIGNhbGxiYWNrIGFyZ3VtZW50LlxuICogQHBhcmFtIG9iamVjdCBhbiBvYmplY3QgdGhhdCBoYXMgdGhlIG5hbWVkIG1ldGhvZFxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgbmFtZSBvZiB0aGUgbWV0aG9kIG9mIG9iamVjdFxuICogQHBhcmFtIC4uLmFyZ3MgYXJndW1lbnRzIHRvIHBhc3MgdG8gdGhlIG1ldGhvZDsgdGhlIGNhbGxiYWNrIHdpbGxcbiAqIGJlIHByb3ZpZGVkIGJ5IFEgYW5kIGFwcGVuZGVkIHRvIHRoZXNlIGFyZ3VtZW50cy5cbiAqIEByZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHZhbHVlIG9yIGVycm9yXG4gKi9cblEubnNlbmQgPSAvLyBYWFggQmFzZWQgb24gTWFyayBNaWxsZXIncyBwcm9wb3NlZCBcInNlbmRcIlxuUS5ubWNhbGwgPSAvLyBYWFggQmFzZWQgb24gXCJSZWRzYW5kcm8nc1wiIHByb3Bvc2FsXG5RLm5pbnZva2UgPSBmdW5jdGlvbiAob2JqZWN0LCBuYW1lIC8qLi4uYXJncyovKSB7XG4gICAgdmFyIG5vZGVBcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAyKTtcbiAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgIG5vZGVBcmdzLnB1c2goZGVmZXJyZWQubWFrZU5vZGVSZXNvbHZlcigpKTtcbiAgICBRKG9iamVjdCkuZGlzcGF0Y2goXCJwb3N0XCIsIFtuYW1lLCBub2RlQXJnc10pLmZhaWwoZGVmZXJyZWQucmVqZWN0KTtcbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLm5zZW5kID0gLy8gWFhYIEJhc2VkIG9uIE1hcmsgTWlsbGVyJ3MgcHJvcG9zZWQgXCJzZW5kXCJcblByb21pc2UucHJvdG90eXBlLm5tY2FsbCA9IC8vIFhYWCBCYXNlZCBvbiBcIlJlZHNhbmRybydzXCIgcHJvcG9zYWxcblByb21pc2UucHJvdG90eXBlLm5pbnZva2UgPSBmdW5jdGlvbiAobmFtZSAvKi4uLmFyZ3MqLykge1xuICAgIHZhciBub2RlQXJncyA9IGFycmF5X3NsaWNlKGFyZ3VtZW50cywgMSk7XG4gICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICBub2RlQXJncy5wdXNoKGRlZmVycmVkLm1ha2VOb2RlUmVzb2x2ZXIoKSk7XG4gICAgdGhpcy5kaXNwYXRjaChcInBvc3RcIiwgW25hbWUsIG5vZGVBcmdzXSkuZmFpbChkZWZlcnJlZC5yZWplY3QpO1xuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufTtcblxuLyoqXG4gKiBJZiBhIGZ1bmN0aW9uIHdvdWxkIGxpa2UgdG8gc3VwcG9ydCBib3RoIE5vZGUgY29udGludWF0aW9uLXBhc3Npbmctc3R5bGUgYW5kXG4gKiBwcm9taXNlLXJldHVybmluZy1zdHlsZSwgaXQgY2FuIGVuZCBpdHMgaW50ZXJuYWwgcHJvbWlzZSBjaGFpbiB3aXRoXG4gKiBgbm9kZWlmeShub2RlYmFjaylgLCBmb3J3YXJkaW5nIHRoZSBvcHRpb25hbCBub2RlYmFjayBhcmd1bWVudC4gIElmIHRoZSB1c2VyXG4gKiBlbGVjdHMgdG8gdXNlIGEgbm9kZWJhY2ssIHRoZSByZXN1bHQgd2lsbCBiZSBzZW50IHRoZXJlLiAgSWYgdGhleSBkbyBub3RcbiAqIHBhc3MgYSBub2RlYmFjaywgdGhleSB3aWxsIHJlY2VpdmUgdGhlIHJlc3VsdCBwcm9taXNlLlxuICogQHBhcmFtIG9iamVjdCBhIHJlc3VsdCAob3IgYSBwcm9taXNlIGZvciBhIHJlc3VsdClcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5vZGViYWNrIGEgTm9kZS5qcy1zdHlsZSBjYWxsYmFja1xuICogQHJldHVybnMgZWl0aGVyIHRoZSBwcm9taXNlIG9yIG5vdGhpbmdcbiAqL1xuUS5ub2RlaWZ5ID0gbm9kZWlmeTtcbmZ1bmN0aW9uIG5vZGVpZnkob2JqZWN0LCBub2RlYmFjaykge1xuICAgIHJldHVybiBRKG9iamVjdCkubm9kZWlmeShub2RlYmFjayk7XG59XG5cblByb21pc2UucHJvdG90eXBlLm5vZGVpZnkgPSBmdW5jdGlvbiAobm9kZWJhY2spIHtcbiAgICBpZiAobm9kZWJhY2spIHtcbiAgICAgICAgdGhpcy50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgbmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIG5vZGViYWNrKG51bGwsIHZhbHVlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIG5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBub2RlYmFjayhlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxufTtcblxuLy8gQWxsIGNvZGUgYmVmb3JlIHRoaXMgcG9pbnQgd2lsbCBiZSBmaWx0ZXJlZCBmcm9tIHN0YWNrIHRyYWNlcy5cbnZhciBxRW5kaW5nTGluZSA9IGNhcHR1cmVMaW5lKCk7XG5cbnJldHVybiBRO1xuXG59KTtcbiIsIi8qXG4gKiBRYW5pbWF0aW9uZnJhbWUuanMgLSBQcm9taXNpZmllZCByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgd2l0aCBRXG4gKi9cbi8qanNsaW50IG5ld2NhcDogdHJ1ZSAqL1xuKGZ1bmN0aW9uIChkZWZpbml0aW9uKSB7XG4gICAgaWYgKHR5cGVvZiBleHBvcnRzID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZGVmaW5pdGlvbigpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHdpbmRvdy5RYW5pbWF0aW9uRnJhbWUgPSBkZWZpbml0aW9uKCk7XG4gICAgfVxufSkoZnVuY3Rpb24gKCkge1xuICBcInVzZSBzdHJpY3RcIjtcblxuICAvLyBJbXBvcnQgUVxuICB2YXIgUSA9IHdpbmRvdy5RIHx8IHJlcXVpcmUoXCJxXCIpO1xuXG4gIC8vIHJlcXVlc3RBbmltYXRpb25GcmFtZSBwb2x5ZmlsbFxuICB2YXIgcmVxdWVzdEFuaW1hdGlvbkZyYW1lID0gKGZ1bmN0aW9uKCl7XG4gICAgcmV0dXJuIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgICAgICAgfHxcbiAgICAgICAgICAgd2luZG93Lm9SZXF1ZXN0QW5pbWF0aW9uRnJhbWUgICAgICB8fFxuICAgICAgICAgICB3aW5kb3cubXNSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgICAgIHx8XG4gICAgICAgICAgIHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgICAgfHxcbiAgICAgICAgICAgd2luZG93LndlYmtpdFJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuICAgICAgICAgICBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dChjYWxsYmFjaywgMTAwMCAvIDYwKTtcbiAgICAgICAgICAgfTtcbiAgfSkoKTtcblxuICAvLyBRYW5pbWF0aW9uRnJhbWUoZWx0OiBET00uRWxlbWVudCkgPT4gUHJvbWlzZVtET00uRWxlbWVudF1cbiAgLy8gLS0tXG4gIC8vXG4gIHZhciBRYW5pbWF0aW9uRnJhbWUgPSBmdW5jdGlvbiAoZWx0KSB7XG4gICAgdmFyIGQgPSBRLmRlZmVyKCk7XG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGZ1bmN0aW9uICgpIHtcbiAgICAgIGQucmVzb2x2ZShlbHQpO1xuICAgIH0sIGVsdCk7XG4gICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgfTtcblxuICByZXR1cm4gUWFuaW1hdGlvbkZyYW1lO1xufSk7XG4iLCIvLyBaYW5pbW8uanMgLSBQcm9taXNlIGJhc2VkIENTUzMgdHJhbnNpdGlvbnNcbi8vIChjKSAyMDExLTIwMTMgUGF1bCBQYW5zZXJyaWV1XG5cbihmdW5jdGlvbiAoZGVmaW5pdGlvbikge1xuICAgIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IGRlZmluaXRpb24oKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBaYW5pbW8gPSBkZWZpbml0aW9uKCk7XG4gICAgfVxuXG59KShmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIChmdW5jdGlvbiAoKSB7XG5cbiAgICB2YXIgUSA9IHdpbmRvdy5RIHx8IHJlcXVpcmUoJ3EnKTtcblxuICAgIC8qKlxuICAgICAqIFByb3ZpZGVzIHJlcXVlc3RBbmltYXRpb25GcmFtZSBpbiBhIGNyb3NzIGJyb3dzZXIgd2F5LlxuICAgICAqIEBhdXRob3IgcGF1bGlyaXNoIC8gaHR0cDovL3BhdWxpcmlzaC5jb20vXG4gICAgICovXG4gICAgaWYgKCAhd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSApIHtcbiAgICAgICAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSA9ICggZnVuY3Rpb24oKSB7XG5cbiAgICAgICAgICAgIHJldHVybiB3aW5kb3cud2Via2l0UmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG4gICAgICAgICAgICAgICAgd2luZG93Lm1velJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuICAgICAgICAgICAgICAgIHdpbmRvdy5vUmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG4gICAgICAgICAgICAgICAgd2luZG93Lm1zUmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG4gICAgICAgICAgICBmdW5jdGlvbiggLyogZnVuY3Rpb24gRnJhbWVSZXF1ZXN0Q2FsbGJhY2sgKi8gY2FsbGJhY2ssXG4gICAgICAgICAgICAgICAgICAgICAgLyogRE9NRWxlbWVudCBFbGVtZW50ICovIGVsZW1lbnQgKSB7XG4gICAgICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQoIGNhbGxiYWNrLCAxMDAwIC8gNjAgKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgfSApKCk7XG4gICAgfTtcblxuICAgIC8qXG4gICAgICogUHJpdmF0ZSBoZWxwZXIgZGVhbGluZyB3aXRoIHByZWZpeCBhbmQgbm9ybWFsaXppbmdcbiAgICAgKiBjc3MgcHJvcGVydGllcywgdHJhbnNpdGlvbi90cmFuc2Zvcm0gdmFsdWVzLlxuICAgICAqL1xuICAgIHZhciBUID0gKGZ1bmN0aW9uIChkb2MpIHtcbiAgICAgICAgdmFyIF9tYXRjaFBhcmVudGhlc2lzID0gLyhcXCguKz9cXCkpL2csXG4gICAgICAgICAgICBfemVyb3BpeGVsID0gL14wcHgkL2csXG4gICAgICAgICAgICBfemVybyA9IFwiMFwiLFxuICAgICAgICAgICAgX3NwYWNlID0gLyAvZyxcbiAgICAgICAgICAgIF9ub3JtUmVnZXggPSAvXFwtKFthLXpdKS9nLFxuICAgICAgICAgICAgX2VtcHR5U3RyaW5nID0gXCJcIixcbiAgICAgICAgICAgIF90cmFuc2l0aW9uZW5kID0gXCJ0cmFuc2l0aW9uZW5kXCIsXG4gICAgICAgICAgICBfdHJhbnNpdGlvbiA9IFwidHJhbnNpdGlvblwiLFxuICAgICAgICAgICAgX3ByZWZpeCA9IG51bGwsXG4gICAgICAgICAgICBfZHVtbXkgPSBudWxsLFxuICAgICAgICAgICAgX2R1bW15VHJhbnNpdGlvbiA9IFwib3BhY2l0eSAxMDBtcyBsaW5lYXIgMHNcIixcbiAgICAgICAgICAgIF9yZXByID0gZnVuY3Rpb24gKHYsIGQsIHQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdiArIFwiIFwiICsgZCArIFwibXMgXCIgKyAodCB8fCBcImxpbmVhclwiKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBfcHJlZml4ZWQgPSB7IFwidHJhbnNmb3JtXCI6IFwiXCIgfSxcbiAgICAgICAgICAgIF9ub3JtUmVwbGFjZWYgPSBmdW5jdGlvbihtLCBnKSB7IHJldHVybiBnLnRvVXBwZXJDYXNlKCk7IH0sXG4gICAgICAgICAgICBfbm9ybUNTU1ZhbCA9IGZ1bmN0aW9uIChtYXRjaCkge1xuICAgICAgICAgICAgICAgIHZhciBhcmdzID0gbWF0Y2guc3Vic3RyKDEsIG1hdGNoLmxlbmd0aC0yKS5zcGxpdChcIixcIiksIHJzdCA9IFtdO1xuICAgICAgICAgICAgICAgIGFyZ3MuZm9yRWFjaChmdW5jdGlvbiAoYXJnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJzdC5wdXNoKGFyZy5yZXBsYWNlKF9zcGFjZSwgX2VtcHR5U3RyaW5nKS5yZXBsYWNlKF96ZXJvcGl4ZWwsIF96ZXJvKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiKFwiICsgcnN0LmpvaW4oXCIsXCIpICsgXCIpXCI7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgX25vcm0gPSBmdW5jdGlvbiAocCkge1xuICAgICAgICAgICAgICAgIHZhciBwcm9wZXJ0eSA9IHBbMF0gPT09IFwiLVwiID8gcC5zdWJzdHIoMSwgcC5sZW5ndGgtMSkgOiBwO1xuICAgICAgICAgICAgICAgIHJldHVybiBwcm9wZXJ0eS5yZXBsYWNlKF9ub3JtUmVnZXgsIF9ub3JtUmVwbGFjZWYpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF9ub3JtVmFsdWUgPSBmdW5jdGlvbiAodmFsKSB7XG4gICAgICAgICAgICAgICAgaWYgKHZhbCA9PT0gbnVsbCB8fCB2YWwgPT09IHVuZGVmaW5lZCkgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGlzTmFOKHZhbCkgPyB2YWwucmVwbGFjZShfbWF0Y2hQYXJlbnRoZXNpcywgX25vcm1DU1NWYWwpIDogdmFsLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvLyBkZXRlY3QgdHJhbnNpdGlvbiBmZWF0dXJlXG4gICAgICAgICAgICBpZiggJ1dlYmtpdFRyYW5zaXRpb24nIGluIGRvYy5ib2R5LnN0eWxlICkge1xuICAgICAgICAgICAgICAgIF90cmFuc2l0aW9uZW5kID0gJ3dlYmtpdFRyYW5zaXRpb25FbmQnO1xuICAgICAgICAgICAgICAgIF9wcmVmaXggPSBcIndlYmtpdFwiO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKHZhciBwIGluIF9wcmVmaXhlZClcbiAgICAgICAgICAgICAgICBfcHJlZml4ZWRbcF0gPSBfcHJlZml4ID8gXCItXCIgKyBfcHJlZml4ICsgXCItXCIgKyBwIDogcDtcblxuICAgICAgICAgICAgX3RyYW5zaXRpb24gPSBfcHJlZml4ID8gX3ByZWZpeCArIFwiLVwiICsgX3RyYW5zaXRpb24gOiBfdHJhbnNpdGlvblxuICAgICAgICAgICAgX3RyYW5zaXRpb24gPSBfbm9ybShfdHJhbnNpdGlvbik7XG4gICAgICAgICAgICBfZHVtbXkgPSBkb2MuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgICAgIF9kdW1teVRyYW5zaXRpb24gPSBfbm9ybVZhbHVlKF9kdW1teVRyYW5zaXRpb24pO1xuICAgICAgICAgICAgX2R1bW15LnN0eWxlW190cmFuc2l0aW9uXSA9IF9kdW1teVRyYW5zaXRpb247XG4gICAgICAgICAgICBfZHVtbXkgPSBfbm9ybVZhbHVlKF9kdW1teS5zdHlsZVtfdHJhbnNpdGlvbl0pO1xuXG4gICAgICAgICAgICBpZiAoX2R1bW15ID09PSBfZHVtbXlUcmFuc2l0aW9uKSB7XG4gICAgICAgICAgICAgICAgX3JlcHIgPSBmdW5jdGlvbiAodiwgZCwgdCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdiArIFwiIFwiICsgZCArIFwibXMgXCIgKyAodCB8fCBcImxpbmVhclwiKSArIFwiIDBzXCI7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLy8gcHJlZml4ZWQgdHJhbnNpdGlvbiBzdHJpbmdcbiAgICAgICAgICAgIHQgOiBfdHJhbnNpdGlvbixcbiAgICAgICAgICAgIC8vIHRyYW5zZm9ybSBhdHRyXG4gICAgICAgICAgICB0cmFuc2Zvcm0gOiBfbm9ybShfcHJlZml4ZWRbXCJ0cmFuc2Zvcm1cIl0pLFxuICAgICAgICAgICAgLy8gcHJlZml4ZWQgdHJhbnNpdGlvbiBlbmQgZXZlbnQgc3RyaW5nXG4gICAgICAgICAgICB0cmFuc2l0aW9uZW5kIDogX3RyYW5zaXRpb25lbmQsXG4gICAgICAgICAgICAvLyBub3JtYWxpemUgY3NzIHByb3BlcnR5XG4gICAgICAgICAgICBub3JtIDogX25vcm0sXG4gICAgICAgICAgICAvLyBwcmVmaXggYSBjc3MgcHJvcGVydHkgaWYgbmVlZGVkXG4gICAgICAgICAgICBwcmVmaXggOiBmdW5jdGlvbiAocCkgeyByZXR1cm4gX3ByZWZpeGVkW3BdID8gX3ByZWZpeGVkW3BdIDogcDsgfSxcbiAgICAgICAgICAgIHJlcHIgOiBfcmVwcixcbiAgICAgICAgICAgIC8vIG5vcm1hbGl6ZSBhIGNzcyB0cmFuc2Zvcm1hdGlvbiBzdHJpbmcgbGlrZVxuICAgICAgICAgICAgLy8gXCJ0cmFuc2xhdGUoMzQwcHgsIDBweCwgMjMwcHgpIHJvdGF0ZSgzNDBkZWcgKVwiXG4gICAgICAgICAgICAvLyAtPiBcInRyYW5zbGF0ZSgzNDBweCwwLDIzMHB4KSByb3RhdGUoMzQwZGVnKVwiXG4gICAgICAgICAgICBub3JtVmFsdWUgOiBfbm9ybVZhbHVlXG4gICAgICAgIH07XG4gICAgfSkod2luZG93LmRvY3VtZW50KSxcblxuICAgIGlzRE9NID0gZnVuY3Rpb24gKGRvbUVsdCkge1xuICAgICAgICByZXR1cm4gZG9tRWx0ICYmIGRvbUVsdC5ub2RlVHlwZSA/IHRydWUgOiBmYWxzZTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIGZ1bGZpbGxlZCBwcm9taXNlIHdyYXBwaW5nIHRoZSBnaXZlbiBET00gZWxlbWVudC5cbiAgICAgKi9cbiAgICBaID0gZnVuY3Rpb24gKGRvbUVsdCkge1xuICAgICAgICBpZiAoaXNET00oZG9tRWx0KSkge1xuICAgICAgICAgICAgcmV0dXJuIFEucmVzb2x2ZShkb21FbHQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYoUS5pc1Byb21pc2UoZG9tRWx0KSkge1xuICAgICAgICAgICAgcmV0dXJuIGRvbUVsdC50aGVuKFopO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIFEucmVqZWN0KG5ldyBFcnJvcihcIlphbmltbyByZXF1aXJlIGFuIEhUTUxFbGVtZW50LCBvciBhIHByb21pc2Ugb2YgYW4gSFRNTEVsZW1lbnRcIikpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8vIHByaXZhdGUgaGVscGVyIHRvIGFkZCBhIHRyYW5zaXRpb25cbiAgICBhZGQgPSBmdW5jdGlvbiAoZG9tRWx0LCBhdHRyLCB2YWx1ZSwgZHVyYXRpb24sIHRpbWluZykge1xuICAgICAgICBhdHRyID0gVC5wcmVmaXgoYXR0cik7XG4gICAgICAgIGlmIChkb21FbHQuc3R5bGVbVC50XSkge1xuICAgICAgICAgICAgZG9tRWx0LnN0eWxlW1QudF0gPSBkb21FbHQuc3R5bGVbVC50XVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICArIFwiLCBcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICArIFQucmVwcihhdHRyLCBkdXJhdGlvbiwgdGltaW5nKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGRvbUVsdC5zdHlsZVtULnRdID0gVC5yZXByKGF0dHIsIGR1cmF0aW9uLCB0aW1pbmcpO1xuICAgICAgICB9XG4gICAgICAgIGRvbUVsdC5zdHlsZVtULm5vcm0oYXR0cildID0gdmFsdWU7XG4gICAgfSxcblxuICAgIC8vIHByaXZhdGUgaGVscGVyIHRvIHJlbW92ZSBhIHRyYW5zaXRpb25cbiAgICByZW1vdmUgPSBmdW5jdGlvbiAoZG9tRWx0LCBhdHRyLCB2YWx1ZSwgZHVyYXRpb24sIHRpbWluZykge1xuICAgICAgICB2YXIgcHJlZml4ZWRBdHRyID0gVC5wcmVmaXgoYXR0ciksXG4gICAgICAgICAgICBrZXlzID0gW107XG4gICAgICAgIGZvciAodmFyIGsgaW4gZG9tRWx0Ll96YW5pbW8pIHtcbiAgICAgICAgICBrZXlzLnB1c2goayk7XG4gICAgICAgIH1cbiAgICAgICAgaWYoa2V5cy5sZW5ndGggPT09IDEgJiYga2V5c1swXSA9PT0gYXR0cikgZG9tRWx0LnN0eWxlW1QudF0gPSBcIlwiO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBTdGFydHMgYSB0cmFuc2l0aW9uIG9uIHRoZSBnaXZlbiBET00gZWxlbWVudCBhbmQgcmV0dXJuc1xuICAgICAqIGEgcHJvbWlzZSB3cmFwcGluZyB0aGUgRE9NIGVsZW1lbnQuXG4gICAgICovXG4gICAgWi50cmFuc2l0aW9uID0gZnVuY3Rpb24gKGRvbUVsdCwgYXR0ciwgdmFsdWUsIGR1cmF0aW9uLCB0aW1pbmcpIHtcbiAgICAgICAgdmFyIGQgPSBRLmRlZmVyKCksIHRpbWVvdXQsXG4gICAgICAgICAgICBjYiA9IGZ1bmN0aW9uIChjbGVhcikge1xuICAgICAgICAgICAgICAgIGlmICh0aW1lb3V0KSB7IGNsZWFyVGltZW91dCh0aW1lb3V0KTsgdGltZW91dCA9IG51bGw7IH1cbiAgICAgICAgICAgICAgICByZW1vdmUoZG9tRWx0LCBhdHRyLCB2YWx1ZSwgZHVyYXRpb24sIHRpbWluZyk7XG4gICAgICAgICAgICAgICAgZG9tRWx0LnJlbW92ZUV2ZW50TGlzdGVuZXIoVC50cmFuc2l0aW9uZW5kLCBjYlRyYW5zaXRpb25lbmQpO1xuICAgICAgICAgICAgICAgIGlmIChjbGVhcikgeyBkZWxldGUgZG9tRWx0Ll96YW5pbW9bYXR0cl07IH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjYlRyYW5zaXRpb25lbmQgPSBmdW5jdGlvbiAoZXZ0KSB7XG4gICAgICAgICAgICAgICAgaWYoVC5ub3JtKGV2dC5wcm9wZXJ0eU5hbWUpID09PSBULm5vcm0oVC5wcmVmaXgoYXR0cikpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNiKHRydWUpOyBkLnJlc29sdmUoZG9tRWx0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIGlmICghaXNET00oZG9tRWx0KSkge1xuICAgICAgICAgICAgZC5yZWplY3QobmV3IEVycm9yKFwiWmFuaW1vIHRyYW5zaXRpb246IG5vIERPTSBlbGVtZW50IVwiKSk7XG4gICAgICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgICAgICB9XG4gICAgICAgIGlmKHdpbmRvdy5pc05hTihwYXJzZUludChkdXJhdGlvbiwgMTApKSkge1xuICAgICAgICAgICAgZC5yZWplY3QobmV3IEVycm9yKFwiWmFuaW1vIHRyYW5zaXRpb246IGR1cmF0aW9uIG11c3QgYmUgYW4gaW50ZWdlciFcIikpO1xuICAgICAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRvbUVsdC5hZGRFdmVudExpc3RlbmVyKFQudHJhbnNpdGlvbmVuZCwgY2JUcmFuc2l0aW9uZW5kKTtcblxuICAgICAgICB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGFkZChkb21FbHQsIGF0dHIsIHZhbHVlLCBkdXJhdGlvbiwgdGltaW5nKTtcbiAgICAgICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmF3VmFsID0gZG9tRWx0LnN0eWxlLmdldFByb3BlcnR5VmFsdWUoVC5wcmVmaXgoYXR0cikpLFxuICAgICAgICAgICAgICAgICAgICBkb21WYWwgPSBULm5vcm1WYWx1ZShyYXdWYWwpLFxuICAgICAgICAgICAgICAgICAgICBnaXZlblZhbCA9IFQubm9ybVZhbHVlKHZhbHVlKTtcblxuICAgICAgICAgICAgICAgIGNiKHRydWUpO1xuICAgICAgICAgICAgICAgIGlmIChkb21WYWwgPT09IGdpdmVuVmFsKSB7IGQucmVzb2x2ZShkb21FbHQpOyB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGQucmVqZWN0KCBuZXcgRXJyb3IoXCJaYW5pbW8gdHJhbnNpdGlvbjogXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICsgZG9tRWx0LmlkICsgXCIgd2l0aCBcIiArIGF0dHIgKyBcIiA9IFwiICsgZ2l2ZW5WYWxcbiAgICAgICAgICAgICAgICAgICAgICAgICsgXCIsIERPTSB2YWx1ZT1cIiArIGRvbVZhbFxuICAgICAgICAgICAgICAgICAgICApKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBkdXJhdGlvbiArIDIwICk7XG5cbiAgICAgICAgICAgIGRvbUVsdC5femFuaW1vID0gZG9tRWx0Ll96YW5pbW8gfHwgeyB9O1xuICAgICAgICAgICAgaWYoZG9tRWx0Ll96YW5pbW9bYXR0cl0pIHtcbiAgICAgICAgICAgICAgICBkb21FbHQuX3phbmltb1thdHRyXS5kZWZlci5yZWplY3QobmV3IEVycm9yKFwiWmFuaW1vIHRyYW5zaXRpb24gXCJcbiAgICAgICAgICAgICAgICAgICAgKyBkb21FbHQuaWQgKyBcIiB3aXRoIFwiXG4gICAgICAgICAgICAgICAgICAgICsgYXR0ciArIFwiPVwiICsgZG9tRWx0Ll96YW5pbW9bYXR0cl0udmFsdWVcbiAgICAgICAgICAgICAgICAgICAgKyBcIiBzdG9wcGVkIGJ5IHRyYW5zaXRpb24gd2l0aCBcIiArIGF0dHIgKyBcIj1cIiArIHZhbHVlXG4gICAgICAgICAgICAgICAgKSk7XG4gICAgICAgICAgICAgICAgZG9tRWx0Ll96YW5pbW9bYXR0cl0uY2IoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRvbUVsdC5femFuaW1vW2F0dHJdID0ge2NiOiBjYiwgdmFsdWU6IHZhbHVlLCBkZWZlcjogZH07XG5cbiAgICAgICAgfSwgZG9tRWx0KTtcblxuICAgICAgICByZXR1cm4gZC5wcm9taXNlO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBBIGZ1bmN0aW9uIHdyYXBwaW5nIFphbmltby50cmFuc2l0aW9uKCkuXG4gICAgICovXG4gICAgWi50cmFuc2l0aW9uZiA9IGZ1bmN0aW9uIChhdHRyLCB2YWx1ZSwgZHVyYXRpb24sIHRpbWluZykge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGVsdCkge1xuICAgICAgICAgICAgcmV0dXJuIFoudHJhbnNpdGlvbihlbHQsIGF0dHIsIHZhbHVlLCBkdXJhdGlvbiwgdGltaW5nKTtcbiAgICAgICAgfTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQXBwbHkgYSBDU1MzIHRyYW5zZm9ybSB2YWx1ZSB0byBhIGdpdmVuIERPTSBlbGVtZW50XG4gICAgICogYW5kIHJldHVybnMgYSBwcm9taXNlIHdyYXBwaW5nIHRoZSBET00gZWxlbWVudC5cbiAgICAgKi9cbiAgICBaLnRyYW5zZm9ybSA9IGZ1bmN0aW9uIChlbHQsIHZhbHVlLCBvdmVyd3JpdGUpIHtcbiAgICAgICAgdmFyIGQgPSBRLmRlZmVyKCk7XG5cbiAgICAgICAgaWYgKCFpc0RPTShlbHQpKSB7XG4gICAgICAgICAgICBkLnJlamVjdChuZXcgRXJyb3IoXCJaYW5pbW8gdHJhbnNmb3JtOiBubyBET00gZWxlbWVudCFcIikpO1xuICAgICAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGVsdC5femFuaW1vICYmIGVsdC5femFuaW1vLmhhc093blByb3BlcnR5KFwidHJhbnNmb3JtXCIpKSB7XG4gICAgICAgICAgICBlbHQuX3phbmltb1tcInRyYW5zZm9ybVwiXS5kZWZlci5yZWplY3QobmV3IEVycm9yKFxuICAgICAgICAgICAgICAgIFwiWmFuaW1vIHRyYW5zaXRpb24gXCIgKyBlbHQuaWQgKyBcIiB3aXRoIHRyYW5zZm9ybT1cIlxuICAgICAgICAgICAgICAgICsgZWx0Ll96YW5pbW9bXCJ0cmFuc2Zvcm1cIl0udmFsdWVcbiAgICAgICAgICAgICAgICArIFwiIHN0b3BwZWQgYnkgdHJhbnNmb3JtPVwiICsgdmFsdWVcbiAgICAgICAgICAgICkpO1xuICAgICAgICAgICAgZWx0Ll96YW5pbW9bXCJ0cmFuc2Zvcm1cIl0uY2IoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZWx0LnN0eWxlW1QudHJhbnNmb3JtXSA9XG4gICAgICAgICAgICAgICAgIW92ZXJ3cml0ZSA/IGVsdC5zdHlsZVtULnRyYW5zZm9ybV0gKyBcIiBcIiArIHZhbHVlIDogdmFsdWU7XG4gICAgICAgICAgICBkLnJlc29sdmUoZWx0KTtcbiAgICAgICAgfSwgZWx0KTtcbiAgICAgICAgcmV0dXJuIGQucHJvbWlzZTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQSBmdW5jdGlvbiB3cmFwcGluZyBaYW5pbW8udHJhbnNmb3JtKCkuXG4gICAgICovXG4gICAgWi50cmFuc2Zvcm1mID0gZnVuY3Rpb24gKHZhbHVlLCBvdmVyd3JpdGUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChlbHQpIHtcbiAgICAgICAgICAgIHJldHVybiBaLnRyYW5zZm9ybShlbHQsIHZhbHVlLCBvdmVyd3JpdGUpO1xuICAgICAgICB9O1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBBIGZ1bmN0aW9uIHdyYXBwaW5nIFphbmltbygpLlxuICAgICAqL1xuICAgIFouZiA9IGZ1bmN0aW9uIChlbHQpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBaKGVsdCk7XG4gICAgICAgIH07XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIE5lZWRlZCB0byBydW4gcGFyYWxsZWwgWmFuaW1vIGFuaW1hdGlvbnMuXG4gICAgICovXG4gICAgWi5hbGwgPSBmdW5jdGlvbiAoZmxpc3QpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChlbCkge1xuICAgICAgICAgICAgcmV0dXJuIFEuYWxsKGZsaXN0Lm1hcChmdW5jdGlvbiAoZikgeyByZXR1cm4gZihlbCk7IH0pKVxuICAgICAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbiAocGxpc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZWplY3RlZCA9IHBsaXN0LmZpbHRlcihmdW5jdGlvbiAocCkgeyByZXR1cm4gUS5pc1JlamVjdGVkKHApOyB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKHJlamVjdGVkLmxlbmd0aCkgcmV0dXJuIFEucmVqZWN0KHJlamVjdGVkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgcmV0dXJuIGVsO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBaLl9UID0gVDtcblxuICAgIHJldHVybiBaO1xufSkoKTtcblxufSk7XG4iXX0=
;