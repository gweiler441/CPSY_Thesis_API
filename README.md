# CPSY_Thesis_API
Documentation of the code used to create a custom Twitter API using Apify's twitter_scraper_lite. Documents orchestrator code and prompt formatting.

This actor is designed to collect tweets from political candidates across multiple elections for academic research purposes. It accepts a list of Twitter handles paired with election-specific date ranges, queries the Twitter Scraper Lite actor for each combination, filters results to the specified date window, and saves the output to a dataset.

The actor is built to handle large datasets. It saves progress to the dataset every 10 candidates and records a checkpoint in a Key-Value store so that if a run is interrupted, it can resume where it left off rather than starting over.

# Important: Clearing the Checkpoint Before Re-Running
The actor uses a Key-Value store called twitter-scraper-state to track which candidate it last completed. If you run the actor more than once, you must clear this value first, otherwise it will skip candidates it thinks it has already processed. To reset it, open the Key-Value store in Apify, find the orchestration-state key, and delete it before starting a new run.

# Input
The only required field is candidateElections, an array of objects each containing the candidate's Twitter handle (without the @ symbol), the election year, and a start and end date in YYYY-MM-DD format. Optionally, maxTweetsPerRun controls how many tweets are collected per candidate per election and defaults to 5 with a maximum of 100. addUserInfo (default true) includes user profile information on each tweet, and scrapeTweetReplies (default false) will also collect replies.

Each entry in candidateElections requires the candidate's Twitter handle (without the @ symbol), the election year, and a start and end date in YYYY-MM-DD format:
    json{
      "candidate": "AOC",
      "electionYear": 2024,
      "start": "2024-09-01",
      "end": "2024-11-05"
      }

# Output
Each record saved to the dataset contains the candidate's Twitter handle, election year, tweet date, tweet text, and a URL to the original tweet.

