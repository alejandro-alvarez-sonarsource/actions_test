function extractPRInfoFromLabeledPR(context) {
    console.log("Labeled PR event");

    const pr = context.payload.pull_request;
    return {
        prNumber: pr.number,
        prHead: pr.head.sha,
        branchName: pr.head.ref
    };
}

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

async function extractPRInfoFromWorkflowRun(github, context) {
    console.log("Extracting PR information from workflow_run event");

    const workflowRun = context.payload.workflow_run;
    return await getPRInfoFromCommit(github, context, workflowRun.head_sha);
}

async function extractPRInfoFromCheckSuite(github, context) {
    console.log("Extracting PR information from check_suite event");

    const checkSuite = context.payload.check_suite;
    return await getPRInfoFromCommit(github, context, checkSuite.head_sha);
}

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

async function getPRLabels(github, context, prNumber) {
    if (!prNumber) return [];
    const { data: pr } = await github.rest.pulls.get({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: prNumber
    });
    return pr.labels ? pr.labels.map(label => label.name) : [];
}

module.exports = async function (github, context, core, excludeJob) {
    let prInfo = { prNumber: null, prHead: null, branchName: null };
    if (context.eventName === 'pull_request' && context.payload.action === 'labeled') {
        prInfo = extractPRInfoFromLabeledPR(context);
    } else if (context.eventName === 'workflow_run') {
        prInfo = await extractPRInfoFromWorkflowRun(github, context);
    } else if (context.eventName === 'check_suite' && context.payload.action === 'completed') {
        prInfo = await extractPRInfoFromCheckSuite(github, context);
    } else {
        prInfo = { prNumber: '', prHead: '', branchName: '' }
    }
    const prStatus = await getCommitStatus(github, context, prInfo.prHead, excludeJob);
    const prLabels = prInfo.prNumber ? await getPRLabels(github, context, prInfo.prNumber) : [];
    core.setOutput('prNumber', prInfo.prNumber);
    core.setOutput('prHead', prInfo.prHead);
    core.setOutput('prBranchName', prInfo.branchName);
    core.setOutput('prStatus', prStatus);
    core.setOutput('prLabels', prLabels);
};
