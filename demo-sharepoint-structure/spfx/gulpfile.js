'use strict';

// Local Node may be newer than SPFx 1.24 engine range; allow build on CI/dev machines.
process.env.SPFX_SKIP_NODE_VERSION_CHECK = 'true';

const build = require('@microsoft/sp-build-web');

build.addSuppression(`Warning - [sass] The local CSS class 'ms-Grid' is not camelCase and will not be type-safe.`);

var getTasks = build.rig.getTasks;
build.rig.getTasks = function () {
  var result = getTasks.call(build.rig);
  result.set('serve', result.get('serve-deprecated'));
  return result;
};

build.initialize(require('gulp'));
