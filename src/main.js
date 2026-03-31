import { Actor } from 'apify';
import { ApifyClient } from 'apify-client';

const TWITTER_SCRAPER_ACTOR_ID = 'apidojo/twitter-scraper-lite';

await Actor.init();

try {
    // Get input from the Actor
    const input = await Actor.getInput();
    
    if (!input) throw new Error('No input provided');

    const {
        candidateElections = [], // Array of {candidate, electionYear, start, end}
        maxTweetsPerRun = 5,
        addUserInfo = true,
        scrapeTweetReplies = false,
    } = input;

    if (!candidateElections.length) throw new Error('No candidate elections provided');

    const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
    const kvStore = await Actor.openKeyValueStore('twitter-scraper-state');
    
    // Check if saved state from a previous run
    let startFromRun = 1;
    let savedState = null;
    
    try {
        savedState = await kvStore.getValue('orchestration-state');
        if (savedState) {
            startFromRun = parseInt(savedState) + 1;
            console.log(`\n🔄 RESUMING from run ${startFromRun} (previous run completed ${savedState})\n`);
        }
    } catch (e) {
        console.log('No previous state found, starting fresh\n');
    }

    const allTweets = [];
    const totalRuns = candidateElections.length;

    console.log(`🚀 Starting Twitter Scraper Orchestrator`);
    console.log(`📊 Processing ${candidateElections.length} candidate-election combinations`);
    console.log(`Collecting up to ${maxTweetsPerRun} tweets per candidate per election`);
    console.log(`Starting from Run ${startFromRun}/${totalRuns}\n`);

    // Iterate through each candidate-election combination
    for (let currentRun = startFromRun; currentRun <= totalRuns; currentRun++) {
        const election = candidateElections[currentRun - 1];
        
        console.log(`\n[Run ${currentRun}/${totalRuns}] Processing @${election.candidate} (${election.electionYear}: ${election.start} → ${election.end})`);

        // Build input for twitter-scraper-lite
        const searchQuery = `from:${election.candidate} since:${election.start} until:${election.end}`;
        
        // Cap at 100 for twitter-scraper-lite's limits
        const maxItemsForActor = Math.min(maxTweetsPerRun * 4, 100);
        
        const runInput = {
            searchTerms: [searchQuery],
            maxItems: maxItemsForActor,
            sort: 'Latest',
            includeSearchTerms: false,
            addUserInfo,
        };

        try {
            // Launch the Twitter Scraper Lite actor
            const run = await client.actor(TWITTER_SCRAPER_ACTOR_ID).call(runInput);
            console.log(`  ✓ Run completed - Run ID: ${run.id}`);

            // Fetch dataset items
            const { items } = await client.dataset(run.defaultDatasetId).listItems();
            console.log(`  ✓ Retrieved ${items.length} raw tweets`);

            // Filter and sort tweets
            const startDate = new Date(election.start + 'T00:00:00Z');
            const endDate = new Date(election.end + 'T23:59:59Z');
            
            const filteredTweets = items
                .filter(item => {
                    const tweetDate = new Date(item.createdAt || item.created_at);
                    return tweetDate >= startDate && tweetDate <= endDate;
                })
                .sort((a, b) => {
                    const dateA = new Date(a.createdAt || a.created_at);
                    const dateB = new Date(b.createdAt || b.created_at);
                    return dateB - dateA;
                })
                .slice(0, maxTweetsPerRun);

            console.log(`  ✓ Filtered to ${filteredTweets.length} tweets within date range`);

            // Format and collect tweets
            for (const tweet of filteredTweets) {
                const tweetDate = new Date(tweet.createdAt || tweet.created_at);
                allTweets.push({
                    candidate: election.candidate,
                    electionYear: election.electionYear,
                    date: tweetDate.toISOString().split('T')[0],
                    text: tweet.text || tweet.full_text || '',
                    url: tweet.url || `https://twitter.com/${election.candidate}/status/${tweet.id_str || tweet.id || ''}`,
                });
            }

        } catch (error) {
            console.error(`  ✗ Error scraping @${election.candidate} for ${election.electionYear}: ${error.message}`);
        }

        // Checkpoint every 10 runs or at the end
        if (currentRun % 10 === 0 || currentRun === totalRuns) {
            console.log(`\n💾 Checkpoint: Saving state and pushing ${allTweets.length} tweets to dataset...`);
            
            // Push all tweets to dataset
            for (const tweet of allTweets) {
                await Actor.pushData(tweet);
            }
            
            // Save state to KV store
            await kvStore.setValue('orchestration-state', currentRun.toString());
            console.log(`✓ Checkpoint complete. Saved progress at run ${currentRun}/${totalRuns}\n`);
            
            // Clear in-memory array
            allTweets.length = 0;
        }

        // Small delay between runs
        if (currentRun < totalRuns) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // Final push if there are any remaining tweets
    if (allTweets.length > 0) {
        console.log(`\n Final push of remaining ${allTweets.length} tweets...`);
        for (const tweet of allTweets) {
            await Actor.pushData(tweet);
        }
    }

    // Clear the saved state
    await kvStore.setValue('orchestration-state', totalRuns.toString());

    console.log('\n' + '='.repeat(60));
    console.log('ORCHESTRATION COMPLETE!');
    console.log('='.repeat(60));
    console.log(`Total runs completed: ${totalRuns}/169`);
    console.log('All tweets have been saved to the dataset.');
    console.log('='.repeat(60));

} catch (error) {
    console.error('Fatal error:', error.message);
    console.error(error);
    throw error;
}

await Actor.exit();
