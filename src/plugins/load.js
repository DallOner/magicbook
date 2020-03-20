var debug = require('debug')('magicbook:load');
var vfs = require('vinyl-fs');
var through = require('through2');
var StreamQueue = require('streamqueue');
var util = require('util');
var _ = require('lodash');

var Plugin = function(registry) {
  registry.add('load', this.loadFiles);
};

function isStringArray(arr) {
  return _.isArray(arr) && _.every(arr, function(f) { return _.isString(f)});
}

function treeToStreams(parent, streams) {

  if(_.isEmpty(parent.files)) return streams;

  if(isStringArray(parent.files)) {
    parent.vinyls = [];
    var stream = vfs.src(parent.files)
      .pipe(through.obj(function(file, enc, cb) {

        // set the parent on the vinyl file so we
        // can get it in the TOC
        file.parent = parent.parent;

        // Set the vars from the parent so they are
        // accessible in liquid.
        if(parent.parent.vars) {
          _.set(file, "pageLocals.part", parent.parent.vars);
          _.set(file, "layoutLocals.part", parent.parent.vars);
        }

        // save the file in vinyls array for TOC.
        parent.vinyls.push(file);

        debug(file.path, file.contents.toString().substring(0, 20));

        cb(null, file);

      }));
    streams.push(stream);
  }
  else {
    _.each(parent.files, function(file) {
      treeToStreams(file, streams);
    });
  }

  return streams;
}

// Turn a part into a full tree consisting of objects, so we later
// can store stream vinyl objects in the objects belonging to the blobs
// they were loaded from.
// Turns this:
// { files: [
//   "firstfile.md",
//   "secondfile.md",
//   {
//     label: "Part",
//     files: [
//       "thirdfile.md",
//       {
//         label: "Sub Part",
//         files: ["fourthfile.md"]
//       }
//     ],
//     myVariable: "Something"
//   }
// ]}
// Into this:
// { files: [
//   {
//     files: [
//       "firstfile.md",
//       "secondfile.md"
//     ]
//   },
//   {
//     label: "Part",
//     files: [
//       {
//         parent: {...},
//         files: ["thirdfile.md"]
//       },
//       {
//         parent: {...}
//         label: "Sub Part",
//         files: ["fourthfile.md"]
//       }
//     ],
//     vars : {
//       label: "Part",
//       myVariable: "Something"
//     }
//  }
// ]}
function filesToTree(part) {

  var fileObjects = [];

  _.each(part.files, function(file) {

    if(_.isString(file)) {

      // If there is no objects in the array, or the latest object
      // is a part, create a non-part object to hold the files.
      if(fileObjects.length == 0 || _.last(fileObjects).label) {
        var vars = _.omit(part, ['files', 'parent', 'vars']);
        fileObjects.push({ files: [], parent:part, vars: vars });
      }

      _.last(fileObjects).files.push(file);
    }
    else if(file.label && file.files) {
      var vars = _.omit(file, ['files', 'parent', 'vars']);
      var child = filesToTree({ label: file.label, files: file.files, parent:part, vars: vars});
      fileObjects.push(child);
    }

  });

  part.files = fileObjects;
  return part;
}

function hasParts(files) {
  return !_.isString(files) && !isStringArray(files);
}

Plugin.prototype = {

  loadFiles: function(config, extras, cb) {

    // If this array has parts in it
    if(hasParts(config.files)) {

      // turn the array into a structure that allows us
      // to parse the tree (strings to objects with children,
      // assign parents). Might need to make this function not
      // alter the original files array.
      extras.partTree = filesToTree({ label: 'root', files: config.files });

      // load streams and assign files to the children of their
      // glob object.
      var streams = treeToStreams(extras.partTree, []);
      var queue = new StreamQueue({ objectMode: true });
      _.each(streams, function(stream) {
        queue.queue(stream);
      });
      queue.done();

      // console.log(util.inspect(extras.partTree, false, null));
      cb(null, config, queue, extras);

    // If this array does not have parts in it
    } else {
      cb(null, config, vfs.src(config.files), extras);
    }

  }
}

module.exports = Plugin;
