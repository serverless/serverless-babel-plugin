'use strict';

const unzip = require('unzip2');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const spawnSync = require('child_process').spawnSync;
const BbPromise = require('bluebird');
const glob = require('glob-all');
const rimraf = require('rimraf');
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

  transform() {
    return new BbPromise((resolve, reject) => {
      if (!this.serverless.service.custom ||
          _.isUndefined(this.serverless.service.custom.babelPresets)) {
        reject('For the serverless-babel-plugin you need to define `babelPresets` as custom configuration in your serverless.yaml');
      }

      if (!Array.isArray(this.serverless.service.custom.babelPresets)) {
        reject('`babelPresets` in your serverless.yaml must be an Array');
      }

      const servicePath = this.serverless.config.servicePath;

      let bundleName = this.serverless.service.service;

      // determine if we are deploying a single function or the entire service
      if (this.options && this.options.f !== undefined) {
        bundleName = `${bundleName}-${this.options.stage}-${this.options.f}`;
      }

      // unzip
      const stream = fs.createReadStream(path.join(servicePath, `.serverless/${bundleName}.zip`))
        .pipe(unzip.Extract({ path: path.join(servicePath, '.serverless/tmpBabelDirectory') }));

      stream.on('error', (error) => {
        reject(error);
      });

      stream.on('finish', () => {
        // compile
        const args = [
          '--out-dir=tmpBabelDirectory',
          'tmpBabelDirectory',
          '--ignore=node_modules',
          `--presets=${this.serverless.service.custom.babelPresets.join(',')}`,
        ];
        const options = {
          cwd: path.join(servicePath, '.serverless'),
        };
        const result = spawnSync(path.join(__dirname, '..', '.bin/babel'), args, options);
        const stdout = result.stdout.toString();
        const sterr = result.stderr.toString();
        if (stdout) {
          this.serverless.cli.log(`Babel compilation:\n${stdout}`);
        }
        if (sterr) {
          reject(sterr);
        }

        // zip
        this.serverless.cli.log('Packaging service with compiled files...');
        const patterns = ['**'];
        const tmpBabelDirectory = '.serverless/tmpBabelDirectory';
        const zip = archiver.create('zip');

        const artifactFilePath = `.serverless/${bundleName}.zip`;
        this.serverless.utils.writeFileDir(artifactFilePath);

        const output = fs.createWriteStream(artifactFilePath);

        output.on('open', () => {
          zip.pipe(output);

          const files = glob.sync(patterns, {
            cwd: tmpBabelDirectory,
            dot: true,
            silent: true,
            follow: true,
          });

          files.forEach((filePath) => {
            const fullPath = path.resolve(tmpBabelDirectory, filePath);

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

        zip.on('error', err => reject(err));

        output.on('close', () => {
          try {
            rimraf.sync(tmpBabelDirectory, { disableGlob: true });
          } catch (err) {
            reject(err);
          }
          resolve(artifactFilePath);
        });
      });
    });
  }
}

module.exports = ServerlessPlugin;
