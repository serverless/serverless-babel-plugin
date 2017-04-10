# Serverless Babel Plugin

A Serverless plugin to compile your JavaScript code with Babel before deployment.

IMPORTANT: If you are interested to maintain or take ownership of this project please reach out to @nikgraf

# Setup

You need to install the plugin as well as a preset. For example the `babel-preset-latest`:

```bash
npm install --save-dev serverless-babel-plugin babel-preset-latest
```

Further you need to add the plugin to your `serverless.yml` and defined which preset you chose:

```yml
plugins:
  - serverless-babel-plugin

custom:
  babelPresets:
    - latest
```

# Usage

Simply run `serverless deploy` and it will compile every JavaScript file in your service with Babel.

# More info

Find a complete example [here](https://github.com/serverless/examples/tree/master/aws-node-function-compiled-with-babel)
