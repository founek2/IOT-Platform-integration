pipeline {
    agent { label 'docker-node' }


    stages {
        stage('Building image') {
            steps{
                script {
                    sh "ci/docker-build.sh"
                }
            }
        }

        stage('Deploy') {
            environment {
                TRIGGER_API_KEY = credentials('docker-compose-trigger-api-key')
            }

            steps {
                sh 'curl  -X POST -H  "X-API-Key: $TRIGGER_API_KEY" --ipv4 http://192.168.10.35:9020/trigger/IOT-bots-prod'
                sh 'curl  -X POST -H  "X-API-Key: $TRIGGER_API_KEY" --ipv4 http://192.168.10.35:9020/trigger/IOT-bots-dev'
            }
        }
    }
}