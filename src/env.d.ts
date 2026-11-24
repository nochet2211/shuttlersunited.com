declare namespace App {
  interface Locals {
    member: import('./lib/types').Member | null;
    isAdmin: boolean;
  }
}
