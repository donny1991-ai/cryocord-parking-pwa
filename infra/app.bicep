targetScope = 'resourceGroup'

@description('Short azd environment name, for example dev or prod.')
param environmentName string

@description('Azure region for app resources.')
param location string = resourceGroup().location

@description('Base workload name used in Azure resource names and tags.')
param appName string = 'cryocord-parking'

@minLength(5)
@maxLength(50)
@description('Globally unique Azure Container Registry name. Must use only lowercase letters and numbers.')
param containerRegistryName string

@secure()
@description('Production Postgres/Supabase connection string.')
param databaseUrl string

@description('Whether the production database connection should use SSL.')
param databaseSsl string = 'true'

@description('Whether Node should reject unauthorized Postgres SSL certificates.')
param databaseSslRejectUnauthorized string = 'true'

@description('Key id label for the active QR signing key.')
param parkingQrKeyId string = 'prod'

@secure()
@description('Optional secret used to sign QR visitor passes. Leave empty to add it manually on the Container App.')
param parkingQrSigningKey string = ''

@secure()
@description('Optional Supabase JWT secret used to verify authenticated requests. Leave empty to add it manually on the Container App.')
param supabaseJwtSecret string = ''

@description('Supabase project URL used for private Storage access. Leave empty to disable entry snapshot upload.')
param supabaseUrl string = ''

@secure()
@description('Optional Supabase service role key used by the server to upload private entry snapshots. Leave empty to add it manually on the Container App.')
param supabaseServiceRoleKey string = ''

@description('Private Supabase Storage bucket for visitor entry snapshots.')
param parkingEntrySnapshotBucket string = 'parking-entry-snapshots'

@secure()
@description('Optional dedicated OTP signing secret. Leave empty to use SUPABASE_JWT_SECRET fallback.')
param authOtpSecret string = ''

@description('Public app URL. Leave empty to use the Container Apps default HTTPS hostname.')
param publicAppUrl string = ''

@description('SMTP server host.')
param smtpHost string = 'mail.cryocord.com.my'

@description('SMTP server port.')
param smtpPort string = '465'

@description('SMTP username.')
param smtpUser string = 'aiprojects@cryocord.com.my'

@description('Optional SMTP From address. Leave empty to use SMTP_USER.')
param smtpFrom string = ''

@secure()
@description('Optional SMTP password for OTP email delivery. Leave empty to add it manually on the Container App.')
param smtpPass string = ''

@description('Whether SMTP should use implicit TLS.')
param smtpSecure string = 'true'

@description('Whether SMTP TLS should reject self-signed or untrusted certificate chains.')
param smtpTlsRejectUnauthorized string = 'true'

@description('EHLO domain sent to the SMTP server.')
param smtpEhloDomain string = 'cryocord-parking.azurecontainerapps.io'

@description('Minimum Container App replicas.')
param minReplicas int = 1

@description('Maximum Container App replicas.')
param maxReplicas int = 3

@description('CPU cores assigned to each app replica.')
param cpuCores string = '0.5'

@description('Memory assigned to each app replica.')
param memory string = '1Gi'

@description('Tags applied to all resources.')
param tags object = {}

var containerAppName = toLower(appName)
var containerEnvironmentName = take('${toLower(appName)}-env-${toLower(environmentName)}', 60)
var logAnalyticsName = take('law-${toLower(appName)}-${toLower(environmentName)}', 63)
var managedIdentityName = take('id-${toLower(appName)}-${toLower(environmentName)}', 128)
var defaultImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
var serviceTags = union(tags, {
  'azd-service-name': 'web'
})

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: serviceTags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerEnvironmentName
  location: location
  tags: serviceTags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  tags: serviceTags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

resource containerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
  tags: serviceTags
}

var acrPullRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')

resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, containerIdentity.id, acrPullRoleDefinitionId)
  scope: containerRegistry
  properties: {
    roleDefinitionId: acrPullRoleDefinitionId
    principalId: containerIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

var secretDefinitions = concat([
  {
    name: 'database-url'
    value: databaseUrl
  }
], empty(parkingQrSigningKey) ? [] : [
  {
    name: 'parking-qr-signing-key'
    value: parkingQrSigningKey
  }
], empty(supabaseJwtSecret) ? [] : [
  {
    name: 'supabase-jwt-secret'
    value: supabaseJwtSecret
  }
], empty(supabaseServiceRoleKey) ? [] : [
  {
    name: 'supabase-service-role-key'
    value: supabaseServiceRoleKey
  }
], empty(smtpPass) ? [] : [
  {
    name: 'smtp-pass'
    value: smtpPass
  }
], empty(authOtpSecret) ? [] : [
  {
    name: 'auth-otp-secret'
    value: authOtpSecret
  }
])

var resolvedAppUrl = empty(publicAppUrl)
  ? 'https://${containerAppName}.${containerEnvironment.properties.defaultDomain}'
  : publicAppUrl

var appEnv = concat([
  {
    name: 'NODE_ENV'
    value: 'production'
  }
  {
    name: 'PORT'
    value: '3000'
  }
  {
    name: 'HOSTNAME'
    value: '0.0.0.0'
  }
  {
    name: 'NEXT_PUBLIC_APP_URL'
    value: resolvedAppUrl
  }
  {
    name: 'DATABASE_URL'
    secretRef: 'database-url'
  }
  {
    name: 'DATABASE_SSL'
    value: databaseSsl
  }
  {
    name: 'DATABASE_SSL_REJECT_UNAUTHORIZED'
    value: databaseSslRejectUnauthorized
  }
  {
    name: 'PARKING_QR_KEY_ID'
    value: parkingQrKeyId
  }
], empty(parkingQrSigningKey) ? [] : [
  {
    name: 'PARKING_QR_SIGNING_KEY'
    secretRef: 'parking-qr-signing-key'
  }
], empty(supabaseJwtSecret) ? [] : [
  {
    name: 'SUPABASE_JWT_SECRET'
    secretRef: 'supabase-jwt-secret'
  }
], empty(supabaseUrl) ? [] : [
  {
    name: 'SUPABASE_URL'
    value: supabaseUrl
  }
], empty(supabaseServiceRoleKey) ? [] : [
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY'
    secretRef: 'supabase-service-role-key'
  }
], [
  {
    name: 'PARKING_ENTRY_SNAPSHOT_BUCKET'
    value: parkingEntrySnapshotBucket
  }
], [
  {
    name: 'SMTP_HOST'
    value: smtpHost
  }
  {
    name: 'SMTP_PORT'
    value: smtpPort
  }
  {
    name: 'SMTP_USER'
    value: smtpUser
  }
], empty(smtpPass) ? [] : [
  {
    name: 'SMTP_PASS'
    secretRef: 'smtp-pass'
  }
], [
  {
    name: 'SMTP_SECURE'
    value: smtpSecure
  }
  {
    name: 'SMTP_TLS_REJECT_UNAUTHORIZED'
    value: smtpTlsRejectUnauthorized
  }
  {
    name: 'SMTP_EHLO_DOMAIN'
    value: smtpEhloDomain
  }
], empty(smtpFrom) ? [] : [
  {
    name: 'SMTP_FROM'
    value: smtpFrom
  }
], empty(authOtpSecret) ? [] : [
  {
    name: 'AUTH_OTP_SECRET'
    secretRef: 'auth-otp-secret'
  }
])

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  tags: serviceTags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${containerIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: secretDefinitions
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: containerIdentity.id
        }
      ]
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 3000
        transport: 'auto'
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
    }
    template: {
      containers: [
        {
          name: 'web'
          image: defaultImage
          env: appEnv
          resources: {
            cpu: json(cpuCores)
            memory: memory
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 20
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 15
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
  dependsOn: [
    acrPullAssignment
  ]
}

output containerAppName string = containerApp.name
output containerAppEndpoint string = resolvedAppUrl
output containerRegistryEndpoint string = containerRegistry.properties.loginServer
