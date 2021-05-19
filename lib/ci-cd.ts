import * as cdk from '@aws-cdk/core';
import * as  codepipeline from '@aws-cdk/aws-codepipeline';
import * as  codebuild from '@aws-cdk/aws-codebuild';
import * as  ecr from '@aws-cdk/aws-ecr';
import * as  iam from '@aws-cdk/aws-iam';
import * as pipelineActions from '@aws-cdk/aws-codepipeline-actions';
import {PipelineEmailNotification} from "./pipeline-notification";
import * as ecs from "@aws-cdk/aws-ecs";
import {EcsRepositories} from "./ecs-repositories";

export interface CiCdPipelineProps extends cdk.StackProps {
    service: ecs.IBaseService,
    cluster: ecs.ICluster,
    ecsRepositories: EcsRepositories,
    codebaseOwnerEmails: string[],
}

export class CiCdPipeline extends cdk.Construct {

    constructor(scope: cdk.Construct, id: string, props: CiCdPipelineProps) {
        super(scope, id);

        const serviceName = props.service.serviceName;

        // pipeline
        const jibBuildProject = buildJibProject(this, serviceName, props.ecsRepositories.ecrRepo);
        const sourceOutput = new codepipeline.Artifact();
        const buildOutput = new codepipeline.Artifact();

        // TODO SQL migration?

        const pipeline = new codepipeline.Pipeline(this, 'ci-cd-eks-pipeline', {
            pipelineName: `${serviceName}-pipeline`,
            stages: [
                {
                    stageName: 'Source',
                    actions: [new pipelineActions.CodeCommitSourceAction({
                        actionName: 'CatchSourceFromCode',
                        repository: props.ecsRepositories.codeCommitRepo,
                        output: sourceOutput,
                    })]
                },
                {
                    stageName: 'Build',
                    actions: [new pipelineActions.CodeBuildAction({
                        actionName: 'BuildAndPushToECR',
                        input: sourceOutput,
                        project: jibBuildProject,
                        outputs: [buildOutput],
                    })]
                },
                {
                    stageName: 'Deploy',
                    actions: [new pipelineActions.EcsDeployAction({
                        actionName: 'DeployAction',
                        service: props.service,
                        imageFile: new codepipeline.ArtifactPath(buildOutput, `imagedefinitions.json`)
                    })]
                }
            ],
        });

        // permissions
        props.ecsRepositories.ecrRepo.grantPullPush(jibBuildProject.role!);
        jibBuildProject.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                "ecs:DescribeCluster",
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:BatchGetImage",
                "ecr:GetDownloadUrlForLayer"
            ],
            resources: [props.cluster.clusterArn],
        }));


        // setup notifications
        new PipelineEmailNotification(this, 'pipeline-email-notification', {
            pipeline: pipeline,
            topicName: `pipeline-${pipeline.pipelineName}`,
            emails: props.codebaseOwnerEmails,
        });

        // output codeCommit uri
        new cdk.CfnOutput(this, `codecommit-uri`, {
            exportName: 'code-commit-url-ssh',
            value: props.ecsRepositories.codeCommitRepo.repositoryCloneUrlSsh
        });
    }
}

const buildJibProject = (scope: cdk.Construct, serviceName: string, ecrRepo: ecr.Repository): codebuild.Project => {
    return new codebuild.PipelineProject(scope, 'build-jib-to-ecr', {
        projectName: 'build-jib-to-ecr',
        environment: {
            buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
            privileged: true
        },
        environmentVariables: {
            'ECR_REPO_URI': {
                value: ecrRepo
            }
        },
        buildSpec: codebuild.BuildSpec.fromObject({
            version: "0.2",
            phases: {
                pre_build: {
                    commands: [
                        'env',
                        'JIB_ECR_USERNAME=AWS',
                        'JIB_ECR_PASSWORD=$(aws ecr get-login-password --region $AWS_DEFAULT_REGION)',
                        'IMAGE_TAG=$CODEBUILD_RESOLVED_SOURCE_VERSION',
                        'chmod +x ./gradlew'
                    ]
                },
                build: {
                    commands: ['./gradlew jib --image=$ECR_REPO_URI:$IMAGE_TAG',]
                },
                post_build: {
                    commands: [
                        'cd ..',
                        `printf '[{\"name\":\"${serviceName}\",\"imageUri\":\"%s\"}]' $ECR_REPO_URI:$IMAGE_TAG > imagedefinitions.json`,
                    ]
                }
            },
            artifacts: {
                files: [
                    'imagedefinitions.json'
                ]
            }
        })
    });
}