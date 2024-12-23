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
                TRIGGER_API_KEY_PROD = credentials('docker-compose-trigger-api-key-free')
            }

            steps {
                sh 'curl  -X POST -H  "X-API-Key: $TRIGGER_API_KEY_PROD" --ipv4 http://free.iotplatforma.cloud:9020/trigger/IOT-bots-prod'
                sh 'curl  -X POST -H  "X-API-Key: $TRIGGER_API_KEY" --ipv4 http://192.168.10.98:9020/trigger/IOT-bots-dev'
            }
        }
    }
}