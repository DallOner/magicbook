var debug = require('debug')('magicbook:liquid');
var through = require("through2");
var tinyliquid = require("tinyliquid");
var helpers = require("../helpers/helpers");
var _ = require("lodash");

var Plugin = function(registry) {
  registry.before("markdown:convert", "liquid", this.liquidPages);
};

Plugin.prototype = {
  liquidPages: function(config, stream, extras, callback) {
    stream = stream.pipe(
      through.obj(function(file, enc, cb) {
        var customTags = _.get(config, "liquid.customTags") || {};
        var template = tinyliquid.compile(file.contents.toString(), {
          customTags: customTags
        });

        // main object
        var locals = {
          format: config.format,
          config: config
        };

        // Add locals set globally
        if (extras.pageLocals) {
          _.assign(locals, extras.pageLocals);
        }

        // Add locals set on the file
        if (file.pageLocals) {
          _.assign(locals, file.pageLocals);
        }

        var includes =
          _.get(file, "pageLocals.page.includes") || config.liquid.includes;
        helpers.renderLiquidTemplate(template, locals, includes, function(
          err,
          data
        ) {
          file.contents = Buffer.from(data);
          file.$el = undefined;

          debug(file.path, file.contents.toString().substring(0, 20));

          cb(err, file);
        });
      })
    );

    callback(null, config, stream, extras);
  }
};

module.exports = Plugin;
