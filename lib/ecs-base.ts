import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as serviceDiscovery from '@aws-cdk/aws-servicediscovery';

export class EcsBase extends cdk.Construct {

    public readonly vpc: ec2.IVpc
    public readonly cluster: ecs.ICluster
    public readonly ecsNamespace: serviceDiscovery.INamespace

    constructor(scope: cdk.Construct, id: string) {
        super(scope, id);

        const clusterName = this.node.tryGetContext('cluster-name');

        this.vpc = ec2.Vpc.fromLookup(scope, 'ecs-vpc', {
            tags: {cluster: clusterName}, // bind by tags, deploy time values are not allowed
        });

        this.ecsNamespace = serviceDiscovery.PrivateDnsNamespace.fromPrivateDnsNamespaceAttributes(this, 'ecs-namespace', {
            namespaceName: cdk.Fn.importValue('ecs-namespace-name'),
            namespaceArn: cdk.Fn.importValue('ecs-namespace-arn'),
            namespaceId: cdk.Fn.importValue('ecs-namespace-id'),
        });

        this.cluster = ecs.Cluster.fromClusterAttributes(this, 'ecs-cluster', {
            vpc: this.vpc,
            clusterName: cdk.Fn.importValue('ecs-cluster-name'),
            clusterArn: cdk.Fn.importValue('ecs-cluster-arn'),
            defaultCloudMapNamespace: this.ecsNamespace,
            securityGroups: [],
        });
    }

}
