/**
 * Extracts PR information from a labeled PR event
 * @param {import('@actions/github').Context} context - GitHub Actions context object provided by github-script
 * @returns {{prNumber: number, prHead: string, branchName: string}} PR information including number, head commit SHA, and branch name
 */
function extractPRInfoFromLabeledPR(context) {
    console.log("Labeled PR event");

    const pr = context.payload.pull_request;
    return {
        prNumber: pr.number,
        prHead: pr.head.sha,
        branchName: pr.head.ref
    };
}

/**
 * Fetches PR information from a commit SHA
 * @param {import('@actions/github').GitHub} github - GitHub API client provided by github-script
 * @param {import('@actions/github').Context} context - GitHub Actions context object provided by github-script
 * @param {string} commitSha - Commit SHA to look up associated PRs
 * @returns {Promise<{prNumber: number|null, prHead: string, branchName: string|null}>} PR information including number, head commit SHA, and branch name
 */
async function getPRInfoFromCommit(github, context, commitSha) {
    let prNumber = null;
    let branchName = null;
    const associatedPrs = await github.rest.pulls.list({
        owner: context.repo.owner,
        repo: context.repo.repo,
        state: 'open',
        head_sha: commitSha
    });
    if (associatedPrs && associatedPrs.data && associatedPrs.data.length > 0) {
        prNumber = associatedPrs.data[0].number;
        const pr = await github.rest.pulls.get({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: prNumber
        });
        branchName = pr.data.head.ref;
    }
    return {
        prNumber,
        prHead: commitSha,
        branchName
    };
}

/**
 * Extracts PR information from a workflow_run event
 * @param {import('@actions/github').GitHub} github - GitHub API client provided by github-script
 * @param {import('@actions/github').Context} context - GitHub Actions context object provided by github-script
 * @returns {Promise<{prNumber: number|null, prHead: string, branchName: string|null}>} PR information including number, head commit SHA, and branch name
 */
async function extractPRInfoFromWorkflowRun(github, context) {
    console.log("Extracting PR information from workflow_run event");

    const workflowRun = context.payload.workflow_run;
    return await getPRInfoFromCommit(github, context, workflowRun.head_sha);
}

/**
 * Extracts PR information from a check_suite event
 * @param {import('@actions/github').GitHub} github - GitHub API client provided by github-script
 * @param {import('@actions/github').Context} context - GitHub Actions context object provided by github-script
 * @returns {Promise<{prNumber: number|null, prHead: string, branchName: string|null}>} PR information including number, head commit SHA, and branch name
 */
async function extractPRInfoFromCheckSuite(github, context) {
    console.log("Extracting PR information from check_suite event");

    const checkSuite = context.payload.check_suite;
    return await getPRInfoFromCommit(github, context, checkSuite.head_sha);
}

/**
 * Extracts PR information from a status event
 * @param {import('@actions/github').GitHub} github - GitHub API client provided by github-script
 * @param {import('@actions/github').Context} context - GitHub Actions context object provided by github-script
 * @returns {Promise<{prNumber: number|null, prHead: string, branchName: string|null}>} PR information including number, head commit SHA, and branch name
 */
async function extractPRInfoFromStatus(github, context) {
    console.log("Extracting PR information from status event");

    const commitSha = context.payload.commit?.sha || context.payload.sha;
    return await getPRInfoFromCommit(github, context, commitSha);
}

/**
 * Gets the status of checks for a specific commit
 * @param {import('@actions/github').GitHub} github - GitHub API client provided by github-script
 * @param {import('@actions/github').Context} context - GitHub Actions context object provided by github-script
 * @param {string} prHead - Commit SHA to check status for
 * @param {string} excludeJob - Name of job to exclude from status check
 * @returns {Promise<string>} Status of the commit ('success', 'failure', or 'pending')
 */
async function getCommitStatus(github, context, prHead, excludeJob) {
    console.log(`Obtaining status for ${prHead}`);
    const { data: checkRuns } = await github.rest.checks.listForRef({
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: prHead
    });

    for (const check of checkRuns.check_runs) {
        console.log(`${check.name} ${check.status} ${check.conclusion}`)
    }

    const filteredCheckRuns = checkRuns.check_runs.filter(
        check => check.name !== excludeJob
    );
    if (!filteredCheckRuns || filteredCheckRuns.length === 0) {
        return 'pending';
    }
    const allSuccess = filteredCheckRuns.every(
        check => check.status === 'completed' && check.conclusion === 'success'
    );
    if (allSuccess) return 'success';
    const anyFailed = filteredCheckRuns.some(
        check => check.status === 'completed' && check.conclusion === 'failure'
    );
    if (anyFailed) return 'failure';
    return 'pending';
}

/**
 * Gets the labels associated with a PR
 * @param {import('@actions/github').GitHub} github - GitHub API client provided by github-script
 * @param {import('@actions/github').Context} context - GitHub Actions context object provided by github-script
 * @param {number|null} prNumber - Pull request number
 * @returns {Promise<string[]>} Array of label names
 */
async function getPRLabels(github, context, prNumber) {
    if (!prNumber) return [];
    const { data: pr } = await github.rest.pulls.get({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: prNumber
    });
    return pr.labels ? pr.labels.map(label => label.name) : [];
}

/**
 * Main function that extracts PR information based on event type and sets outputs
 * @param {import('@actions/github').GitHub} github - GitHub API client provided by github-script
 * @param {import('@actions/github').Context} context - GitHub Actions context object provided by github-script
 * @param {import('@actions/core')} core - GitHub Actions core module
 * @param {string} excludeJob - Name of job to exclude from status check
 * @returns {Promise<void>}
 */
module.exports = async function (github, context, core, excludeJob) {
    let prInfo = { prNumber: null, prHead: null, branchName: null };
    if (context.eventName === 'pull_request' && context.payload.action === 'labeled') {
        prInfo = extractPRInfoFromLabeledPR(context);
    } else if (context.eventName === 'workflow_run') {
        prInfo = await extractPRInfoFromWorkflowRun(github, context);
    } else if (context.eventName === 'check_suite' && context.payload.action === 'completed') {
        prInfo = await extractPRInfoFromCheckSuite(github, context);
    } else if (context.eventName === 'status') {
        prInfo = await extractPRInfoFromStatus(github, context);
    } else {
        prInfo = { prNumber: null, prHead: null, branchName: null }
    }
    const prStatus = await getCommitStatus(github, context, prInfo.prHead, excludeJob);
    console.log(`Status for ${prInfo.prHead}: ${prStatus}`);
    const prLabels = prInfo.prNumber ? await getPRLabels(github, context, prInfo.prNumber) : [];
    core.setOutput('prNumber', prInfo.prNumber);
    core.setOutput('prHead', prInfo.prHead);
    core.setOutput('prBranchName', prInfo.branchName);
    core.setOutput('prStatus', prStatus);
    core.setOutput('prLabels', prLabels);
};
