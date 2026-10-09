import { describe, expect, it } from "vitest";
import { isPrivateAddress } from "./mail.ts";

describe("SMTP host guard", () => {
  it("refuses the server's own network", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("allows public mail servers", () => {
    for (const ip of ["142.250.4.108", "52.96.0.1", "2607:f8b0:4004::6c"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});
