// PM2 process for the LingoLearn API. The path goes through the `current`
// symlink, so a reload after a release starts the new build.
module.exports = {
    apps: [{
        name: 'lingolearn-api',
        cwd: '/srv/lingolearn/current/backend',
        script: 'dist/src/server.js',
        instances: 1,
        max_memory_restart: '300M',
        env: { NODE_ENV: 'production' },
        time: true,
    }],
};
