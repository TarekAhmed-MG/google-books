package models

import play.api.libs.json.{Json, OFormat}

case class Bookshelf(
                      kind: String,                        // e.g. "books#bookshelf"
                      id: Int,                             // Google returns numeric IDs like 0, 1, 2...
                      title: String,                       // "Favorites", "Purchased", etc.
                      access: Option[String],              // "PUBLIC" / "PRIVATE" (can be missing)
                      selfLink: Option[String],            // sometimes missing in mylibrary responses
                      updated: Option[String],             // RFC3339 timestamp, may be missing
                      created: Option[String],             // RFC3339 timestamp, may be missing
                      volumeCount: Option[Int],            // may be 0 or missing
                      volumesLastUpdated: Option[String]   // may be missing
                    )

object Bookshelf {
  implicit val format: OFormat[Bookshelf] = Json.format[Bookshelf]
}
