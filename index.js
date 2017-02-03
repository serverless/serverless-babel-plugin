'use strict';

const unzip = require('unzip2');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const spawnSync = require('child_process').spawnSync;
const BbPromise = require('bluebird');
const glob = require('glob-all');
const _ = require('lodash');

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      'after:deploy:createDeploymentArtifacts': this.transform.bind(this),
      'after:deploy:function:packageFunction': this.transform.bind(this),
    };
  }

  zipDirectory(servicePath, zipFilePath) {
    const patterns = ['**'];

    const zip = archiver.create('zip');
    this.serverless.utils.writeFileDir(zipFilePath);
    const output = fs.createWriteStream(zipFilePath);

    output.on('open', () => {
      zip.pipe(output);

      const files = glob.sync(patterns, {
        cwd: servicePath,
        dot: true,
        silent: true,
        follow: true,
      });

      files.forEach((filePath) => {
        const fullPath = path.resolve(
          servicePath,
          filePath
        );

        const stats = fs.statSync(fullPath);

        if (!stats.isDirectory(fullPath)) {
          zip.append(fs.readFileSync(fullPath), {
            name: filePath,
            mode: stats.mode,
          });
        }
      });

      zip.finalize();
    });

    return new BbPromise((resolve, reject) => {
      output.on('close', () => resolve(zipFilePath));
      zip.on('error', err => reject(err));
    });
  }

  compileArtifact(name) {
    const servicePath = this.serverless.config.servicePath;
    const tmpBabelDirectory = `.serverless/${name}`;

    return new BbPromise((resolve, reject) => {
      // unzip
      const stream = fs.createReadStream(path.join(servicePath, `${tmpBabelDirectory}.zip`))
        .pipe(unzip.Extract({ path: path.join(servicePath, `${tmpBabelDirectory}`) }));

      stream.on('close', () => resolve())
      stream.on('error', (error) => reject(error));
    })
    .then(() => {
      return new BbPromise((resolve, reject) => {
        // compile
        const args = [
          `${tmpBabelDirectory}`,
          `--out-dir=${tmpBabelDirectory}`,
          '--ignore=node_modules',
          `--presets=${this.serverless.service.custom.babelPresets.join(',')}`,
        ];

        const babelcli = path.join(__dirname, 'node_modules', '.bin/babel');
        const result = spawnSync(babelcli, args);

        if (result.status !== 0) {
          const sterr = result.stderr ? result.stderr.toString() : null;
          reject(sterr);
        } else {
          const stdout = result.stdout ? result.stdout.toString() : null;
          this.serverless.cli.log(`Babel compilation:\n${stdout}`);
          resolve();
        }
      });
    })
    .then(() => {
      return this.zipDirectory(tmpBabelDirectory, `${tmpBabelDirectory}.zip`)
    });
  }

  transform() {
    if (!this.serverless.service.custom ||
        this.serverless.service.custom.babelPresets === undefined) {
      reject('For the serverless-babel-plugin you need to define `babelPresets` as custom configuration in your serverless.yaml');
    }

    if (!Array.isArray(this.serverless.service.custom.babelPresets)) {
      reject('`babelPresets` in your serverless.yaml must be an Array');
    }

    if (this.options.functionObj) {
      return this.compileArtifact(this.options.functionObj.name);
    }

    if (this.serverless.service.package.individually) {
      const allFunctions = this.serverless.service.getAllFunctions();
      const packagePromises = _.map(allFunctions, functionName =>
        this.compileArtifact(this.serverless.service.getFunction(functionName).name)
      );

      return BbPromise.all(packagePromises);
    } else {
      return this.compileArtifact(this.serverless.service.service);
    }
  }
}

module.exports = ServerlessPlugin;
