import { test, expect } from '@playwright/test';

const mobileNav = (page) => page.getByRole('navigation', { name: 'Mobile navigation' });

async function expectNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
}

test('the four workspaces fit small phones and preserve browser navigation', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [label, route] of [['Guests', 'guests'], ['Transport', 'transport'], ['Rooms', 'rooms'], ['Kitchen', 'kitchen']]) {
      const link = mobileNav(page).getByRole('link', { name: label, exact: true });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`#${route}$`));
      await expect(link).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoOverflow(page);
    }
  }

  await page.goBack();
  await expect(mobileNav(page).getByRole('link', { name: 'Rooms', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test('a guest can be found and checked in, with the update saved after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search guests' }).fill('Girishbhai');
  const guest = page.locator('.mobile-guest-card').filter({ hasText: 'Girishbhai & Taraben Patel' });
  await expect(page.locator('.mobile-guest-card')).toHaveCount(1);
  await guest.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(guest.locator('.badge')).toHaveText('Checked in');

  await page.reload();
  await page.getByRole('textbox', { name: 'Search guests' }).fill('Girishbhai');
  await expect(guest.locator('.badge')).toHaveText('Checked in');
  await expect(guest.getByRole('button', { name: 'Check in', exact: true })).toHaveCount(0);
});

test('the add-guest sheet requires details and saves a new group', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add guest', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Welcome a new guest' });
  await dialog.getByRole('button', { name: 'Add guest', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await dialog.getByLabel('Guest or group name').evaluate((input) => input.validity.valueMissing)).toBe(true);
  await expectNoOverflow(page);

  await dialog.getByLabel('Guest or group name').fill('Nirav Patel & Family');
  await dialog.getByLabel('City / mandir center').fill('Edison, NJ');
  await dialog.getByLabel('Number of guests').fill('3');
  await dialog.getByLabel('Dietary preference').selectOption('Jain');
  await dialog.getByRole('button', { name: 'Add guest', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search guests' }).fill('Nirav Patel');
  await expect(page.locator('.mobile-guest-card')).toHaveCount(1);
  await expect(page.locator('.mobile-guest-card')).toContainText('3 guests');

  await page.reload();
  await page.getByRole('textbox', { name: 'Search guests' }).fill('Nirav Patel');
  await page.locator('.mobile-guest-card').getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Jain vegetarian');
});

test('assigning a room updates both the bed matrix and the guest roster', async ({ page }) => {
  await page.goto('/#rooms');
  await page.getByRole('button', { name: 'Assign room', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Make room for a warm welcome' });
  await dialog.getByRole('combobox', { name: 'Guest or group', exact: true }).selectOption({ label: 'Kiritbhai & Family · 4 beds' });
  await dialog.getByRole('combobox', { name: 'Room', exact: true }).selectOption('A-101');
  await dialog.getByRole('button', { name: 'Assign room', exact: true }).click();
  const room = page.locator('.room-card').filter({ has: page.getByRole('heading', { name: 'Room A-101', exact: true }) });
  await expect(room).toContainText('Kiritbhai & Family');
  await expect(room).toContainText('4 of 4 beds allocated');

  await mobileNav(page).getByRole('link', { name: 'Guests', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search guests' }).fill('Kiritbhai');
  await expect(page.locator('.mobile-guest-card')).toContainText('Samarpan · A-101');
  await page.reload();
  await page.getByRole('textbox', { name: 'Search guests' }).fill('Kiritbhai');
  await expect(page.locator('.mobile-guest-card')).toContainText('Samarpan · A-101');
});

test('checkout returns the used beds to the linen queue', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search guests' }).fill('Rameshbhai Choksi');
  await page.locator('.mobile-guest-card').getByRole('button', { name: 'Details', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'A thoughtful welcome' });
  await dialog.getByRole('button', { name: 'Check out', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  await mobileNav(page).getByRole('link', { name: 'Rooms', exact: true }).click();
  await page.getByRole('button', { name: /^Linen refresh/ }).click();
  const room = page.locator('.room-card').filter({ has: page.getByRole('heading', { name: 'Room C-312', exact: true }) });
  await expect(room).toBeVisible();
  await expect(room).toContainText('0 of 2 beds allocated');
  await expect(room.getByRole('button', { name: 'Room C-312, bed 1: needs linen refresh', exact: true })).toBeVisible();
  await page.reload();
  await expect(room.getByRole('button', { name: 'Room C-312, bed 1: needs linen refresh', exact: true })).toBeVisible();
});

test('a new offsite group can be assigned a hotel room', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add guest', exact: true }).click();
  const guestForm = page.getByRole('dialog', { name: 'Welcome a new guest' });
  await guestForm.getByLabel('Guest or group name').fill('Sonal Mehta & Family');
  await guestForm.getByLabel('City / mandir center').fill('Parsippany, NJ');
  await guestForm.getByLabel('Number of guests').fill('2');
  await guestForm.getByRole('combobox', { name: 'Accommodation', exact: true }).selectOption('Offsite');
  await guestForm.getByRole('button', { name: 'Add guest', exact: true }).click();

  await mobileNav(page).getByRole('link', { name: 'Rooms', exact: true }).click();
  await page.getByRole('button', { name: 'Assign room', exact: true }).click();
  const assignment = page.getByRole('dialog', { name: 'Make room for a warm welcome' });
  const guestId = await assignment.getByRole('option', { name: /Sonal Mehta & Family/ }).getAttribute('value');
  await assignment.getByRole('combobox', { name: 'Guest or group', exact: true }).selectOption(guestId);
  await assignment.getByRole('combobox', { name: 'Room', exact: true }).selectOption('F-216');
  await assignment.getByRole('button', { name: 'Assign room', exact: true }).click();

  await mobileNav(page).getByRole('link', { name: 'Guests', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search guests' }).fill('Sonal Mehta');
  await expect(page.locator('.mobile-guest-card')).toContainText('Fairfield Inn · F-216');
  await page.reload();
  await page.getByRole('textbox', { name: 'Search guests' }).fill('Sonal Mehta');
  await expect(page.locator('.mobile-guest-card')).toContainText('Fairfield Inn · F-216');
});

test('transport assignment, dispatch and completion stay connected to the roster', async ({ page }) => {
  await page.goto('/#transport');
  await page.getByRole('searchbox', { name: 'Search trips' }).fill('Kiritbhai');
  const trip = page.locator('.trip-card').filter({ hasText: 'Kiritbhai & Family' });
  await trip.getByRole('button', { name: 'Assign driver', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Assign a driver' });
  await dialog.getByRole('radio', { name: /Rameshbhai Mehta/ }).check();
  await dialog.getByRole('button', { name: 'Save driver' }).click();
  await trip.getByRole('button', { name: 'Dispatch', exact: true }).click();
  await expect(trip.locator('.badge')).toHaveText('On the way');

  await mobileNav(page).getByRole('link', { name: 'Guests', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search guests' }).fill('Kiritbhai');
  await page.locator('.mobile-guest-card').getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Vehicle assigned');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await mobileNav(page).getByRole('link', { name: 'Transport', exact: true }).click();
  await page.reload();
  await page.getByRole('searchbox', { name: 'Search trips' }).fill('Kiritbhai');
  await expect(trip.locator('.badge')).toHaveText('On the way');
  await trip.getByRole('button', { name: 'Complete trip', exact: true }).click();
  await expect(trip.locator('.badge')).toHaveText('Completed');
});

test.describe('kitchen day planning', () => {
  test.use({ timezoneId: 'America/New_York' });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-08T12:00:00-04:00'));
  });

  test('the simplified kitchen has mobile day navigation and a calendar for future dates', async ({ page }) => {
    await page.goto('/#kitchen');
    const date = page.getByLabel('Choose planning date', { exact: true });
    await expect(date).toHaveValue('2026-10-08');
    const days = page.getByRole('group', { name: 'Select a planning day; swipe for more dates' });
    await expect(days.getByRole('button', { name: 'Thursday, October 8, 2026, Today', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#kit-preparation, .kit-menu-card, .kit-kitchen-note, .kit-diet-card')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Start service|Start preparation|Record plates|Finish service|Reopen service)$/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Kitchen updates', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Next day', exact: true }).click();
    await expect(date).toHaveValue('2026-10-09');
    await page.getByRole('button', { name: 'Previous day', exact: true }).click();
    await expect(date).toHaveValue('2026-10-08');

    await date.fill('2027-12-31');
    await page.getByRole('button', { name: 'Next day', exact: true }).click();
    await expect(date).toHaveValue('2028-01-01');
    await page.getByRole('button', { name: 'Previous day', exact: true }).click();
    await expect(date).toHaveValue('2027-12-31');
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(date).toHaveValue('2026-10-08');
    const futureDay = days.getByRole('button', { name: 'Sunday, October 18, 2026', exact: true });
    await futureDay.click();
    await expect(date).toHaveValue('2026-10-18');
    await expect(futureDay).toHaveAttribute('aria-pressed', 'true');
    expect(await days.evaluate((strip) => strip.scrollLeft)).toBeGreaterThan(0);

    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(date).toBeVisible();
      await expectNoOverflow(page);
    }
  });

  test('guest forecasts and saved headcounts stay separate for each planning day', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('seva.guests.v1')) {
        localStorage.setItem('seva.guests.v1', JSON.stringify([
          {
            id: 'kitchen-future-guest', name: 'Future family', initials: 'FF', count: 7,
            status: 'Arriving', arrivalDate: '2026-10-09', departureDate: '2026-10-11',
            arrivalTime: '13:00', stay: 'Samarpan', diet: 'Regular',
          },
          {
            id: 'kitchen-day-visitor', name: 'Visiting family', initials: 'VF', count: 3,
            status: 'Arriving', arrivalDate: '2026-10-09', departureDate: '2026-10-11',
            arrivalTime: '13:00', stay: 'Day visitor', diet: 'Regular',
          },
          {
            id: 'kitchen-departed-guest', name: 'Departed family', initials: 'DF', count: 9,
            status: 'Departed', arrivalDate: '2026-10-08', departureDate: '2026-10-11',
            arrivalTime: '08:00', stay: 'Day visitor', diet: 'Regular',
          },
        ]));
      }
    });
    await page.goto('/#kitchen');
    const date = page.getByLabel('Choose planning date', { exact: true });
    const service = page.getByRole('region', { name: 'Lunch service' });
    const count = service.locator('.kit-big-number');
    const meals = page.getByRole('group', { name: 'Choose a meal' });

    await expect(count).toHaveText('135guests');
    await service.getByRole('button', { name: 'Adjust headcount' }).click();
    const adjustment = page.getByRole('dialog', { name: 'Adjust lunch plan' });
    await adjustment.getByLabel('Volunteers', { exact: true }).fill('50');
    await adjustment.getByRole('button', { name: 'Save headcount' }).click();
    await expect(count).toHaveText('140guests');

    await page.getByRole('button', { name: 'Next day', exact: true }).click();
    await expect(date).toHaveValue('2026-10-09');
    await expect(count).toHaveText('10guests');
    await expect(meals.getByRole('button', { name: /^Breakfast/ }).locator('.kit-meal-count')).toHaveText('0expected');
    await service.getByRole('button', { name: 'Adjust headcount' }).click();
    await expect(adjustment.getByLabel('Volunteers', { exact: true })).toHaveValue('0');
    await adjustment.getByLabel('Volunteers', { exact: true }).fill('61');
    await adjustment.getByRole('button', { name: 'Save headcount' }).click();
    await expect(count).toHaveText('71guests');

    await date.fill('2026-10-10');
    await expect(count).toHaveText('7guests');
    await expect(meals.getByRole('button', { name: /^Breakfast/ }).locator('.kit-meal-count')).toHaveText('7expected');
    await date.fill('2026-10-12');
    await expect(count).toHaveText('0guests');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await date.fill('2026-10-08');
      await expect(count).toHaveText('140guests');
      await date.fill('2026-10-09');
      await expect(count).toHaveText('71guests');
    }

    await page.reload();
    await expect(date).toHaveValue('2026-10-08');
    await expect(count).toHaveText('140guests');
    await page.getByRole('button', { name: 'Next day', exact: true }).click();
    await expect(count).toHaveText('71guests');
  });
});
