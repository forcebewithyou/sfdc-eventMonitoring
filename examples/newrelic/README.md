# Send data to New Relic Insights

These example scripts pull the most recent `ApexCallout` or `ApexSoap` records and push them to New Relic's Insight.  This is useful for reporting on outliers for callout load times or callout failures.

## Prerequisites
1.  A [New Relic](https://newrelic.com) account with the Insights capabilities
2.  An [Insights API key](https://docs.newrelic.com/docs/insights/insights-data-sources/custom-data/insert-custom-events-insights-api#register) for Insert and Query
3.  [jq](https://stedolan.github.io/jq/download/) installed
4.  [eventmonitoring](https://www.npmjs.com/package/sfdc-eventmonitoring) installed

## Usage
I found that this is most useful when run via cron and a wrapper script.

1.  Create a directory for the script and `jq_transform` file to live in.  (eg `$HOME/eventmonitoring/scripts/apexcallouts/`)
2.  Download the `insertApexCallouts.sh` or `insertApexSoap.sh` and the matching `jq_transform` file into that directory
3.  Create a wrapper script `newrelic.sh` to call the script inside your directory
    ```bash
    export PATH="$PATH:$HOME/bin"

    export NEWRELIC_ACCOUNT_ID="55555"
    export NEWRELIC_INSERT_KEY="xxxxx"
    export NEWRELIC_QUERY_KEY="yyyyy"
    export LOG_FILE="/path/to/logfile.log"
    export USER_TMP="/path/to/usermap.json"

    sh insertApexCallouts.sh > /dev/null
    ```
4.  Add to cron
    ```text
    */30 * * * * sh /home/username/eventmonitoring/scripts/apexcallouts/newrelic.sh
    ```

## Query data and build dashboards
Once you have data in the insights platform, you can make queries and build dashboards / alerts.  Keep in mind that your data will be up to 3hrs delayed so I recommend adding the `since 3 hours ago` to your queries.

![Dashboard Example](https://raw.githubusercontent.com/pcon/sfdc-eventMonitoring/master/examples/newrelic/dashboard.png)

The dashboard above was created with the following queries

```text
SELECT max(timestamp) from ApexCallout since today
```

```text
SELECT average(time) from ApexCallout since 3 hours ago
```

```text
SELECT max(time) from ApexCallout since 3 hours ago
```