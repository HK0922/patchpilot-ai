def invoice_total(prices, discount_percent=0):
    if not 0 <= discount_percent <= 100:
        raise ValueError("discount_percent must be between 0 and 100")
    return round(sum(prices) * (1 - discount_percent / 100), 2)
