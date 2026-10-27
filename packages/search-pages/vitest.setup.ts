import { configure } from "@testing-library/react";

// findBy* waits for a lazily loaded tool; 1s was too short on CI (27 Oct).
configure({ asyncUtilTimeout: 10_000 });
