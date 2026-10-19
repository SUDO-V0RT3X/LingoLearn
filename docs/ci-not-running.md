# Why GitLab CI doesn't run

**Short version:** the host academic GitLab won't start any CI job for this project, however small. Nothing in our `.gitlab-ci.yml` can change that, so we test locally and deploy by hand.

## What we found (18 October 2026)

Every one of the project's 46 pipelines, back to the first on 3 September, failed before a single job started. GitLab gives two reasons:

| Pipeline | GitLab's reason |
|---|---|
| More than one job | "The pipeline size limit was exceeded" (at most 1 job per pipeline) |
| Exactly one job | "Project exceeded the allowed number of jobs in active pipelines" |

To find the real limit we pushed the smallest pipelines possible to a throwaway branch:

1. One job that only prints "hello": refused.
2. One job that waits for someone to press play: refused.
3. One job that only starts a child pipeline: refused.

Each was refused while nothing else was running. So the "active jobs" limit is effectively **0**: no job can ever start. Only the host GitLab administrators can raise it.

The runner on the droplet was never the problem. It is registered, online and polling; GitLab simply never has a job to give it. An external commit status (a result posted by another system) is accepted, so GitLab itself works.

## What we do instead

- **Before pushing:** run the tests locally (`./runTests.sh`, or see [ci.md](ci.md) for the full replica on an empty database).
- **To deploy:** run [`deploy/manual-deploy.sh`](../deploy/manual-deploy.sh) from a machine with the droplet's SSH key. It copies the current checkout to the droplet and runs the same release script, which builds beside the live site and only switches if the build, unit tests and migrations pass. See [deploy.md](deploy.md).

`.gitlab-ci.yml` is kept with `when: never`, so pushes don't create red pipelines.
