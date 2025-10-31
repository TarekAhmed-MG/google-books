package utils

import com.google.cloud.secretmanager.v1.{AccessSecretVersionRequest, SecretManagerServiceClient}

object SecretManager {
  def access(resourceName: String): String = {
    val client = SecretManagerServiceClient.create()
    try {
      val req  = AccessSecretVersionRequest.newBuilder().setName(resourceName).build()
      val resp = client.accessSecretVersion(req)
      resp.getPayload.getData.toStringUtf8
    } finally client.close()
  }
}
