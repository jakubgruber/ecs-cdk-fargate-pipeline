import * as cdk from '@aws-cdk/core';
import codepipeline = require('@aws-cdk/aws-codepipeline');
import * as sns from "@aws-cdk/aws-sns";
import * as eventTargets from '@aws-cdk/aws-events-targets';
import * as events from '@aws-cdk/aws-events';
import {EmailSubscription} from "@aws-cdk/aws-sns-subscriptions";

export interface PipelineNotificationProps {
    topicName: string; // notification topic name
    emails: string[]; // email addresses to get notifications
    pipeline: codepipeline.Pipeline; // the pipeline
}

export class PipelineEmailNotification extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, props: PipelineNotificationProps) {
        super(scope, id);

        const topic = new sns.Topic(this, 'Topic', {
            topicName: props.topicName,
        });

        props.emails.forEach(email => {
            topic.addSubscription(new EmailSubscription(email));
        });

        const ePipeline = events.EventField.fromPath('$.detail.pipeline');
        const eState = events.EventField.fromPath('$.detail.state');
        const pipelineBaseUrl = cdk.Fn.sub('https://${AWS::Region}.console.aws.amazon.com/codepipeline/home?region=${AWS::Region}#/view/',);

        props.pipeline.onStateChange('OnPipelineStateChange', {
            eventPattern: {
                detail: {
                    state: ['STARTED', 'FAILED', 'SUCCEEDED'],
                },
            },
            target: new eventTargets.SnsTopic(topic, {
                message: events.RuleTargetInput.fromText(`Pipeline ${ePipeline} changed state to ${eState}. To view the pipeline, go to ${pipelineBaseUrl + ePipeline}.`),
            }),
        });
    }
}
