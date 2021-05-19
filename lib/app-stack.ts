import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecsPatterns from '@aws-cdk/aws-ecs-patterns';
import {DnsRecordType} from "@aws-cdk/aws-servicediscovery";
import {EcsBase} from "./ecs-base";
import {CiCdPipeline} from "./ci-cd";
import {EcsRepositories} from "./ecs-repositories";

export class AppStack extends cdk.Stack {

    public readonly ecsRepositories: EcsRepositories
    public readonly loadBalancedService: ecsPatterns.ApplicationLoadBalancedFargateService

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const ecsBase = new EcsBase(this, 'ecs-base');

        const serviceName = this.node.tryGetContext('service-name');

        this.ecsRepositories = new EcsRepositories(this, 'ecs-repositories', {
            serviceName,
        })

        const taskRole = new iam.Role(this, `ecs-taskRole-${serviceName}`, {
            roleName: `ecs-taskRole-${serviceName}`,
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
        });

        const executionRolePolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: ['*'],
            actions: [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ]
        });

        const taskDef = new ecs.FargateTaskDefinition(this, "ecs-taskdef", {
            taskRole: taskRole,
        });
        taskDef.addToExecutionRolePolicy(executionRolePolicy);

        taskDef.addContainer(serviceName, {
            image: ecs.ContainerImage.fromEcrRepository(this.ecsRepositories.ecrRepo),
            memoryLimitMiB: 256,
            cpu: 256,
            logging: new ecs.AwsLogDriver({
                streamPrefix: serviceName
            }),
            portMappings: [{
                containerPort: 8080,
                protocol: ecs.Protocol.TCP
            }]
        });

        this.loadBalancedService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'ecs-service', {
            cluster: ecsBase.cluster,
            serviceName: serviceName,
            cloudMapOptions: {
                cloudMapNamespace: ecsBase.ecsNamespace,
                name: serviceName,
                dnsRecordType: DnsRecordType.A,
            },
            circuitBreaker: {rollback: true,},
            taskDefinition: taskDef,
            desiredCount: 2,
            publicLoadBalancer: true,
            listenerPort: 80,
        });

        const scaling = this.loadBalancedService.service.autoScaleTaskCount({maxCapacity: 6});
        scaling.scaleOnCpuUtilization('cpu-scaling', {
            targetUtilizationPercent: 10,
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60)
        });

        // continuous integration & delivery
        new CiCdPipeline(this, 'ci-cd-pipeline', {
            cluster: ecsBase.cluster,
            service: this.loadBalancedService.service,
            ecsRepositories: this.ecsRepositories,
            codebaseOwnerEmails: ['dummy@email.com']
        });

        // output loadbalancer dns
        new cdk.CfnOutput(this, 'load-balancer-dns', {value: this.loadBalancedService.loadBalancer.loadBalancerDnsName});
    }

}
