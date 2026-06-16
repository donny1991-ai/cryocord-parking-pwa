targetScope = 'subscription'

@description('Short azd environment name, for example dev or prod.')
param environmentName string

@description('Azure region for the resource group and app resources.')
param location string = deployment().location

@description('Base workload name used in Azure resource names and tags.')
param appName string = 'cryocord-parking'

@description('Resource group for this project. The shared database can stay in its existing resource group.')
param resourceGroupName string = 'rg-${appName}-${environmentName}'

@minLength(5)
@maxLength(50)
@description('Globally unique Azure Container Registry name. Must use only lowercase letters and numbers.')
param containerRegistryName string = 'acrcryocordparking${replace(toLower(environmentName), '-', '')}'

@secure()
@description('Production Postgres/Supabase connection string.')
param databaseUrl string

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

@secure()
@description('Optional SMTP password for OTP email delivery. Leave empty to add it manually on the Container App.')
param smtpPass string = ''

@secure()
@description('Optional Redis connection URL for application-level caching, for example rediss://:<key>@<host>:6380. Leave empty to disable Redis wiring.')
param redisUrl string = ''

@description('Namespace prefix for application Redis keys. Useful when sharing an existing Redis instance.')
param redisKeyPrefix string = 'cryocord-parking:${environmentName}:'

@description('Whether the production database connection should use SSL.')
param databaseSsl string = 'true'

@description('Whether Node should reject unauthorized Postgres SSL certificates.')
param databaseSslRejectUnauthorized string = 'true'

@description('Maximum Postgres connections per app replica.')
param databasePoolMax string = '3'

@description('Key id label for the active QR signing key.')
param parkingQrKeyId string = 'prod'

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

@description('Whether SMTP should use implicit TLS.')
param smtpSecure string = 'true'

@description('Whether SMTP TLS should reject self-signed or untrusted certificate chains.')
param smtpTlsRejectUnauthorized string = 'true'

@description('EHLO domain sent to the SMTP server.')
param smtpEhloDomain string = 'cryocord-parking.azurecontainerapps.io'

@description('Minimum Container App replicas.')
param minReplicas int = 1

@description('Maximum Container App replicas.')
param maxReplicas int = 5

@description('CPU cores assigned to each app replica.')
param cpuCores string = '1.0'

@description('Memory assigned to each app replica.')
param memory string = '2Gi'

@description('HTTP concurrent request threshold that triggers Container Apps scale-out.')
param httpScaleConcurrentRequests string = '25'

var tags = {
  'azd-env-name': environmentName
  workload: appName
  app: 'cryocord-parking-pwa'
}

resource projectResourceGroup 'Microsoft.Resources/resourceGroups@2024-07-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module app './app.bicep' = {
  name: 'container-app-${environmentName}'
  scope: projectResourceGroup
  params: {
    environmentName: environmentName
    location: location
    appName: appName
    containerRegistryName: containerRegistryName
    databaseUrl: databaseUrl
    databaseSsl: databaseSsl
    databaseSslRejectUnauthorized: databaseSslRejectUnauthorized
    databasePoolMax: databasePoolMax
    parkingQrKeyId: parkingQrKeyId
    parkingQrSigningKey: parkingQrSigningKey
    supabaseJwtSecret: supabaseJwtSecret
    supabaseUrl: supabaseUrl
    supabaseServiceRoleKey: supabaseServiceRoleKey
    parkingEntrySnapshotBucket: parkingEntrySnapshotBucket
    authOtpSecret: authOtpSecret
    publicAppUrl: publicAppUrl
    smtpHost: smtpHost
    smtpPort: smtpPort
    smtpUser: smtpUser
    smtpFrom: smtpFrom
    smtpPass: smtpPass
    redisUrl: redisUrl
    redisKeyPrefix: redisKeyPrefix
    smtpSecure: smtpSecure
    smtpTlsRejectUnauthorized: smtpTlsRejectUnauthorized
    smtpEhloDomain: smtpEhloDomain
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    cpuCores: cpuCores
    memory: memory
    httpScaleConcurrentRequests: httpScaleConcurrentRequests
    tags: tags
  }
}

output AZURE_RESOURCE_GROUP string = projectResourceGroup.name
output AZURE_CONTAINER_APP_NAME string = app.outputs.containerAppName
output AZURE_CONTAINER_APP_ENDPOINT string = app.outputs.containerAppEndpoint
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = app.outputs.containerRegistryEndpoint
output SERVICE_WEB_URI string = app.outputs.containerAppEndpoint
