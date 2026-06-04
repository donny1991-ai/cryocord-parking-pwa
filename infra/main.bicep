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

@secure()
@description('Optional dedicated OTP signing secret. Leave empty to use SUPABASE_JWT_SECRET fallback.')
param authOtpSecret string = ''

@secure()
@description('Optional SMTP password for OTP email delivery. Leave empty to add it manually on the Container App.')
param smtpPass string = ''

@description('Whether the production database connection should use SSL.')
param databaseSsl string = 'true'

@description('Whether Node should reject unauthorized Postgres SSL certificates.')
param databaseSslRejectUnauthorized string = 'true'

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
    parkingQrKeyId: parkingQrKeyId
    parkingQrSigningKey: parkingQrSigningKey
    supabaseJwtSecret: supabaseJwtSecret
    authOtpSecret: authOtpSecret
    publicAppUrl: publicAppUrl
    smtpHost: smtpHost
    smtpPort: smtpPort
    smtpUser: smtpUser
    smtpFrom: smtpFrom
    smtpPass: smtpPass
    smtpSecure: smtpSecure
    smtpEhloDomain: smtpEhloDomain
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    cpuCores: cpuCores
    memory: memory
    tags: tags
  }
}

output AZURE_RESOURCE_GROUP string = projectResourceGroup.name
output AZURE_CONTAINER_APP_NAME string = app.outputs.containerAppName
output AZURE_CONTAINER_APP_ENDPOINT string = app.outputs.containerAppEndpoint
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = app.outputs.containerRegistryEndpoint
output SERVICE_WEB_URI string = app.outputs.containerAppEndpoint
