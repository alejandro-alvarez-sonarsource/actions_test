function extractPRInfoFromLabeledPR(context) {
    const pr = context.payload.pull_request;
    return {
        prNumber: pr.number,
        prHead: pr.head.sha,
        branchName: pr.head.ref
    };
}

async function extractPRInfoFromWorkflowRun(github, context) {
    const workflowRun = context.payload.workflow_run;
    const prHead = workflowRun.head_sha;
    let prNumber = null;
    let branchName = null;
    if (workflowRun.event === 'pull_request') {
        const associatedPrs = await github.rest.pulls.list({
            owner: context.repo.owner,
            repo: context.repo.repo,
            state: 'open',
            head_sha: prHead
        });
        if (associatedPrs && associatedPrs.length > 0) {
            prNumber = associatedPrs[0].number;
        }
    }
    if (prNumber) {
        const pr = await github.rest.pulls.get({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: prNumber
        });
        branchName = pr.head.ref;
    }
    return {
        prNumber,
        prHead,
        branchName
    };
}

async function extractPRInfoFromCheckSuite(github, context) {
    const checkSuite = context.payload.check_suite;
    const prHead = checkSuite.head_sha;
    let prNumber = null;
    let branchName = null;
    if (checkSuite.pull_requests && checkSuite.pull_requests.length > 0) {
        prNumber = checkSuite.pull_requests[0].number;
        const pr = await github.rest.pulls.get({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: prNumber
        });
        branchName = pr.head.ref;
    }
    return {
        prNumber,
        prHead,
        branchName
    };
}

module.exports = async ({ github, context, core }) => {
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
    core.setOutput('prNumber', prInfo.prNumber);
    core.setOutput('prHead', prInfo.prHead);
    core.setOutput('branchName', prInfo.branchName);
};
