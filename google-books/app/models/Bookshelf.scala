package models

import play.api.libs.json.{Json, OFormat} // Make sure OFormat is imported

case class Bookshelf(
                      kind: String,
                      id: Int, // Or String? Match Google API response precisely
                      selfLink: String,
                      title: String,
                      access: String,
                      updated: String,
                      created: String,
                      volumeCount: Int,
                      volumesLastUpdated: String
                    )

object Bookshelf {
  // **Crucial:** Ensure this implicit format is defined in the companion object
  implicit val format: OFormat[Bookshelf] = Json.format[Bookshelf]
}