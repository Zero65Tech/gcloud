const Config = require("@zero65/config");



exports.gitClonePrivate = (repo, sshKeySecretEnv) => {
  return [{
    id: 'Git Clone Private (1/2)',
    name: 'gcr.io/cloud-builders/git',
    secretEnv: [ sshKeySecretEnv ],
    script: `
      echo "$${ sshKeySecretEnv }" > /root/.ssh/id_rsa
      chmod 400 /root/.ssh/id_rsa
      ssh-keyscan -t rsa ${ repo.host } > /root/.ssh/known_hosts
    `,
    volumes: [{
      name: 'ssh',
      path: '/root/.ssh'
    }]
  },{
    id: 'Git Clone Private (2/2)',
    name: 'gcr.io/cloud-builders/git',
    args: [ 'clone', '--branch', repo.branch, '--depth', 1, '--single-branch', `git@${ repo.host }:${ repo.owner }/${ repo.name }.git`, '.' ],
    volumes: [{
      name: 'ssh',
      path: '/root/.ssh'
    }]
  }];
}

exports.npmScripts = (config) => {

  let steps = [];

  if(config.scopes) {

    let script = '';

    config.scopes.forEach(scope => {
      let registry = Config.artifacts.npm['default'];
      if(Config.artifacts.npm[scope])
        registry = { ...registry, ...Config.artifacts.npm[scope] };
      script += `
        gcloud artifacts print-settings npm \
          --project=${ registry.project } \
          --repository=${ registry.repository } \
          --location=${ registry.region } \
          --scope=${ scope } >> .npmrc
      `
    });

    steps.push({
      id: 'Artifacts Registry (1/2)',
      name: 'gcr.io/cloud-builders/gcloud',
      script: script
    });

    steps.push({
      id: 'Artifacts Registry (2/2)',
      name: 'gcr.io/cloud-builders/npm',
      script: 'npx google-artifactregistry-auth'
    });

  }

  if(config.cmds) {
    config.cmds.forEach(cmd => steps.push({
      id: 'npm ' + cmd,
      name: config.builder || 'gcr.io/cloud-builders/npm',
      script: 'npm ' + cmd
    }));
  }

  return steps;

}

exports.docker = (config) => {

  let steps = [];

  if(config.file)
    steps.push({
      id: 'Dockerfile',
      name: 'gcr.io/cloud-builders/curl',
      args: [ '-o', 'Dockerfile', `https://gcloud-rxujgioa4q-uc.a.run.app/build/dockerfile/${ config.file }` ]
    });

  let registry = Config.artifacts.docker['default'];
  if(Config.artifacts.docker[config.name])
    registry = { ...registry, ...Config.artifacts.docker[config.name] };

  let tag = `${ registry.region }-docker.pkg.dev/${ registry.project }/${ registry.repository }/${ config.name }:${ config.tag }`;
  let tag2 = `${ registry.region }-docker.pkg.dev/${ registry.project }/${ registry.repository }/${ config.name }:latest`;

  steps.push({
    id: 'Docker Build',
    name: 'gcr.io/cloud-builders/docker',
    args: [ 'build', '-t', tag, '-t', tag2, '-f', `Dockerfile`, '.' ]
  });

  steps.push({
    id: 'Docker Push',
    name: 'gcr.io/cloud-builders/docker',
    args: [ 'push', tag ]
  });

  steps.push({
    id: 'Docker Push latest',
    name: 'gcr.io/cloud-builders/docker',
    args: [ 'push', tag2 ]
  });

  return steps;

}

exports.deployRun = (config, dockerConfig) => {

  let service = Config.run['default'];
  if(Config.run[config.name])
    service = { ...service, ...Config.run[config.name] };

  if(config.overrides)
    service = { ...service, ...config.overrides };

  let registry = Config.artifacts.docker['default'];
  if(Config.artifacts.docker[dockerConfig.name])
    registry = { ...registry, ...Config.artifacts.docker[dockerConfig.name] };

  return {
    id: `Run Deploy ${ service['project'] }/${ service['region'] }/${ service.name || config.name }`,
    name: 'gcr.io/cloud-builders/gcloud',
    args: [
      'run', 'deploy', service.name || config.name,
      '--image', `${ registry.region }-docker.pkg.dev/${ registry.project }/${ registry.repository }/${ dockerConfig.name }:${ dockerConfig.tag }`,
      '--project',  service['project'],
      '--region',   service['region'],
      '--platform', service['platform'],
      '--port',     service['port'],
      '--memory',   service['memory'],
      '--cpu',      service['cpu'],
      '--timeout',       service['timeout'],
      '--concurrency',   service['concurrency'],
      '--min-instances', service['min-instances'],
      '--max-instances', service['max-instances'],
      '--set-env-vars',  `PLATFORM=GCP,PROJECT=${ service['project'] },ENV=run,STAGE=${ service['project'] == 'zero65-test' ? 'beta' : 'prod' }`,
      '--service-account', service['service-account'] + '@' + service['project'] + '.iam.gserviceaccount.com'
    ]
  };

}
