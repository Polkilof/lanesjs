# Lanes Licence

Copyright © 2026 Oleksandr Kupriyanov. All rights reserved.

This is a source-available licence, not an open-source one. The source is public
so that you can read it, audit it and debug against it. What you may *do* with it
is set out below.

## 1. Definitions

**Software** — the contents of this repository and the `lanesjs` package.

**Free Components** — everything in the Software except the Pro Components.

**Pro Components** — the files under `pro/`, published as the `lanesjs/pro`
entry point, and any plugin distributed as part of it.

**Licence Key** — a signed string issued by the copyright holder, applied with
`setLicense()`.

**Developer** — a natural person who writes, modifies or maintains source code
that imports the Software. People who only run the resulting application are not
Developers.

**Updates Window** — the period stated inside a Licence Key, during which
releases of the Software are covered by that key.

## 2. Free Components

You may use, copy and modify the Free Components, without charge and without a
Licence Key, and distribute them as an integrated part of your own applications —
including commercial ones, and including applications you sell.

You may not distribute the Free Components, modified or not, as a standalone
library, component, template or development tool, whether free or paid. In plain
words: build whatever you like with it; do not republish it as itself.

## 3. Pro Components

The Pro Components require a valid Licence Key for any use other than evaluation.

Evaluation means local development, prototypes and demonstrations. Shipping an
application that imports the Pro Components to production, to customers, or to
anyone outside your organisation requires a Licence Key.

A Licence Key is issued per Developer. Count the people who write or maintain the
code, not the servers, applications, end users or seats.

**Nothing is technically disabled without a key.** The Pro Components work, and
the Software says once in the console, and in a small badge, that it is running
unlicensed. This is deliberate: a licence check that breaks someone's production
screen punishes the wrong person. It is also not permission — Section 3 applies
whether or not the badge is visible.

You may not remove, obscure or suppress that notice unless you hold a valid
Licence Key.

The public availability of the source does not grant any right to use the Pro
Components. Copying the Pro Components out of this repository, or reimplementing
them from it, to avoid a Licence Key is a breach of this licence.

## 4. What a key covers, and for how long

A Licence Key is perpetual for every release published within its Updates Window:
those versions may be used indefinitely, including after the window closes, and
including in new projects.

Releases published after the Updates Window closes are not covered. The check
compares the window against the **build date of the package**, never against the
user's clock, so an application already shipped never stops working and never
starts asking for anything.

Renewing extends the window forward. There is no subscription, and no recurring
charge is required to keep working software working.

## 5. Refunds

If the Software does not do what its documentation says it does, and that is
reported within 30 days of purchase, the purchase price is refunded.

## 6. No warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

## 7. Limitation of liability

IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE. Where liability cannot be excluded by law, it is limited to the amount
paid for the Licence Key in the twelve months preceding the claim.

## 8. Termination

This licence ends if its terms are breached and the breach is not corrected
within 30 days of written notice. Applications already distributed to end users
before termination may continue to be used by those end users.

## 9. Governing law

The laws of Ukraine, excluding conflict-of-law rules.

---

Questions about licensing, and requests for a key, go to
[github.com/Polkilof/lanesjs/issues](https://github.com/Polkilof/lanesjs/issues).
The project lives at [polkilof.github.io/lanesjs](https://polkilof.github.io/lanesjs/).
