import * as cdk from "@aws-cdk/core";
import * as ecr from "@aws-cdk/aws-ecr";
import * as codeCommit from "@aws-cdk/aws-codecommit";

export interface EcsRepositoriesProps extends cdk.StackProps {
    serviceName: string,
}

export class EcsRepositories extends cdk.Construct {

    public readonly ecrRepo: ecr.Repository;
    public readonly codeCommitRepo: codeCommit.Repository;

    constructor(scope: cdk.Construct, id: string, props: EcsRepositoriesProps) {
        super(scope, id);

        this.codeCommitRepo = new codeCommit.Repository(this, 'codecommit-repo', {
            repositoryName: props.serviceName,
        });

        this.ecrRepo = new ecr.Repository(this, 'ecr-repo', {
            repositoryName: props.serviceName,
        });
    }

}