<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules
- Points balance changes only through SQL functions (place_bet, declare_result, reset_market); clients have no write access to profiles.points or bets, so balances can't be tampered with.
- Admin is a role in user_roles checked via has_role(); the first account that signs up is made admin by the signup trigger.
- Pages use the browser client with row-level access rules; there is no protected route layout, pages show a sign-in prompt instead.
