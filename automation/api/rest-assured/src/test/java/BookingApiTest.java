import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.lessThan;
import static org.hamcrest.MatcherAssert.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;

import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Tests for demo-scenarios/session-4-restful-booker/3_API_testi_kontrollnimekiri.md.
 * Expected results come from the checklist, the API docs
 * (https://restful-booker.herokuapp.com/apidoc/index.html) and requirement 2.1 in
 * 1_Broneeringu_nouded_mustand.md. Every test checks the status code and what the API
 * actually stored (read back with GET). Each test creates its own booking. Synthetic data only.
 */
class BookingApiTest {

    @BeforeAll
    static void configure() {
        RestAssured.baseURI = "https://restful-booker.herokuapp.com";
        RestAssured.enableLoggingOfRequestAndResponseIfValidationFails();
    }

    @Test
    @DisplayName("T1 POST /booking stores exactly the sent data")
    void createStoresSentData() {
        Map<String, Object> sent = booking(randomCheckin(), 2);

        Map<String, Object> created = given().contentType(ContentType.JSON).accept("application/json").body(sent)
                .when().post("/booking")
                .then().statusCode(200)
                .extract().jsonPath().getMap("");

        assertEquals(sent, created.get("booking"));
        assertEquals(sent, storedBooking((Integer) created.get("bookingid")));
    }

    @Test
    @DisplayName("T2 PUT /booking/:id without token is rejected and data is unchanged")
    void updateWithoutTokenIsRejected() {
        Map<String, Object> original = booking(randomCheckin(), 2);
        int id = create(original);
        Map<String, Object> changed = booking(randomCheckin(), 2);
        changed.put("firstname", "Muudetud");

        given().contentType(ContentType.JSON).accept("application/json").body(changed)
                .when().put("/booking/{id}", id)
                .then().statusCode(403);

        assertEquals(original, storedBooking(id));
    }

    @Test
    @DisplayName("T3 PUT /booking/:id with token stores the new dates")
    void updateWithTokenStoresNewDates() {
        LocalDate checkin = randomCheckin();
        int id = create(booking(checkin, 2));
        Map<String, Object> changed = booking(checkin.plusDays(7), 3);

        Map<String, Object> response = given().contentType(ContentType.JSON).accept("application/json")
                .cookie("token", token()).body(changed)
                .when().put("/booking/{id}", id)
                .then().statusCode(200)
                .extract().jsonPath().getMap("");

        assertEquals(changed, response);
        assertEquals(changed, storedBooking(id));
    }

    @Test
    @DisplayName("T4 DELETE /booking/:id removes the booking")
    void deleteRemovesBooking() {
        int id = create(booking(randomCheckin(), 2));

        // API docs: DELETE returns 201 Created.
        given().cookie("token", token())
                .when().delete("/booking/{id}", id)
                .then().statusCode(201);

        given().accept("application/json")
                .when().get("/booking/{id}", id)
                .then().statusCode(404);
    }

    @Test
    @DisplayName("T5 req 2.1 POST /booking with checkout before checkin is rejected and nothing is stored")
    void checkoutBeforeCheckinIsRejected() {
        LocalDate checkin = randomCheckin();
        Map<String, Object> invalid = booking(checkin, 2);
        invalid.put("bookingdates", Map.of("checkin", checkin.toString(), "checkout", checkin.minusDays(2).toString()));

        int status = given().contentType(ContentType.JSON).accept("application/json").body(invalid)
                .when().post("/booking")
                .then().extract().statusCode();

        List<Object> found = given().accept("application/json")
                .queryParam("firstname", invalid.get("firstname"))
                .queryParam("lastname", invalid.get("lastname"))
                .when().get("/booking")
                .then().statusCode(200)
                .extract().jsonPath().getList("");

        // Both checks report, so a failure shows whether the API answered wrong, stored wrong, or both.
        // Req 2.1 does not name a status code; any 4xx client error counts as rejected.
        assertAll(
                () -> assertThat("POST /booking status", status, allOf(greaterThanOrEqualTo(400), lessThan(500))),
                () -> assertEquals(List.of(), found, "bookings stored for this guest"));
    }

    // Unique synthetic guest so the name search in T5 cannot match other users' bookings.
    private static Map<String, Object> booking(LocalDate checkin, int nights) {
        String suffix = ThreadLocalRandom.current().ints(6, 'a', 'z' + 1)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString();
        return new java.util.HashMap<>(Map.of(
                "firstname", "Test",
                "lastname", "Koolitus" + suffix,
                "totalprice", 200,
                "depositpaid", true,
                "bookingdates", Map.of("checkin", checkin.toString(), "checkout", checkin.plusDays(nights).toString()),
                "additionalneeds", "Breakfast"));
    }

    // Random check-in 90..179 days ahead, UTC.
    private static LocalDate randomCheckin() {
        return LocalDate.now(ZoneOffset.UTC).plusDays(90 + ThreadLocalRandom.current().nextInt(90));
    }

    private static int create(Map<String, Object> booking) {
        return given().contentType(ContentType.JSON).accept("application/json").body(booking)
                .when().post("/booking")
                .then().statusCode(200)
                .extract().path("bookingid");
    }

    private static Map<String, Object> storedBooking(int id) {
        return given().accept("application/json")
                .when().get("/booking/{id}", id)
                .then().statusCode(200)
                .extract().jsonPath().getMap("");
    }

    private static String token() {
        return given().contentType(ContentType.JSON)
                .body(Map.of("username", "admin", "password", "password123"))
                .when().post("/auth")
                .then().statusCode(200)
                .extract().path("token");
    }
}
